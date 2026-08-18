use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::project::{
    CreateProjectRequest, Project, ProjectUrlUpdate, UpdateProjectRequest,
};
use crate::models::resource::{
    CreateResourceParams, EditorialState, ResourceKind, VisibilityState,
};
use crate::repositories::project_repo::{
    ProjectCreateParams, ProjectRepository, ProjectUpdateParams,
};
use crate::repositories::resource_repo::ResourceRepository;

pub struct ProjectService;

impl ProjectService {
    /// Crear proyecto y resource envelope en una transacción.
    pub async fn create(pool: &PgPool, req: CreateProjectRequest) -> Result<Project, AppError> {
        let id = Uuid::new_v4();
        /* [018A-83] El control de visibilidad del editor es el mecanismo de
         * publicación de proyectos: visible => ready + public, oculto => draft +
         * private. El catálogo público exige editorial='ready', así que un
         * proyecto 'visible' sin ready nunca aparecía (bug 018A-83). */
        let editorial = if req.is_visible {
            EditorialState::Ready
        } else {
            EditorialState::Draft
        };
        let visibility = if req.is_visible {
            VisibilityState::Public
        } else {
            VisibilityState::Private
        };

        let mut tx = pool.begin().await?;

        ResourceRepository::create(
            &mut tx,
            CreateResourceParams {
                id,
                kind: ResourceKind::Project,
                title: &req.title,
                editorial,
                visibility,
            },
        )
        .await?;

        let project = ProjectRepository::create(
            &mut tx,
            ProjectCreateParams {
                id,
                title: &req.title,
                description: &req.description,
                url: req.url.as_deref(),
                cover_image: req.cover_image.as_deref(),
                sort_order: req.sort_order,
                is_visible: req.is_visible,
            },
        )
        .await?;

        tx.commit().await?;
        Ok(project)
    }

    pub async fn get_by_id(pool: &PgPool, id: Uuid) -> Result<Project, AppError> {
        ProjectRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::NotFound("Proyecto no encontrado".into()))
    }

    pub async fn list_all(pool: &PgPool) -> Result<Vec<Project>, AppError> {
        Ok(ProjectRepository::list_all(pool).await?)
    }

    pub async fn list_visible(pool: &PgPool) -> Result<Vec<Project>, AppError> {
        Ok(ProjectRepository::list_visible(pool).await?)
    }

    /// Actualiza proyecto y envelope juntos para evitar estados divergentes.
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        req: UpdateProjectRequest,
    ) -> Result<Project, AppError> {
        let (url, clear_url) = match &req.url {
            ProjectUrlUpdate::Unchanged => (None, false),
            ProjectUrlUpdate::Clear => (None, true),
            ProjectUrlUpdate::Set(value) => (Some(value.as_str()), false),
        };

        /* [018A-85] Misma semántica que la URL: None conserva la portada,
         * Some(None) la limpia, Some(Some(url)) la reemplaza. */
        let (cover_image, clear_cover) = match &req.cover_image {
            Some(Some(value)) => (Some(value.as_str()), false),
            Some(None) => (None, true),
            None => (None, false),
        };

        /* [018A-83] La visibilidad explícita del proyecto sincroniza el estado
         * editorial del envelope (ready/draft). None (autosave sin tocar
         * visibilidad) conserva el editorial actual. */
        let editorial = match req.is_visible {
            Some(true) => Some(EditorialState::Ready),
            Some(false) => Some(EditorialState::Draft),
            None => None,
        };

        let mut tx = pool.begin().await?;
        let project = ProjectRepository::update(
            &mut tx,
            ProjectUpdateParams {
                id,
                title: req.title.as_deref(),
                description: req.description.as_deref(),
                url,
                clear_url,
                cover_image,
                clear_cover,
                sort_order: req.sort_order,
                is_visible: req.is_visible,
            },
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Proyecto no encontrado".into()))?;

        let envelope_updated = ResourceRepository::update_resource_metadata(
            &mut tx,
            id,
            ResourceKind::Project,
            req.title.as_deref(),
            req.is_visible,
            editorial,
        )
        .await?;
        if !envelope_updated {
            return Err(AppError::NotFound(
                "Envelope de proyecto no encontrado".into(),
            ));
        }

        tx.commit().await?;
        Ok(project)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), AppError> {
        let mut tx = pool.begin().await?;
        let trashed =
            ResourceRepository::soft_delete_kind_tx(&mut tx, id, ResourceKind::Project).await?;
        if !trashed {
            return Err(AppError::NotFound("Proyecto no encontrado".into()));
        }
        tx.commit().await?;
        Ok(())
    }
}
