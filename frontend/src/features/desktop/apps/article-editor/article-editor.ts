/* wandori.us — Article Editor App
 * Programa editorial de artículos/About.
 * No crea ventanas ni chrome; devuelve solo contenido para AppRegistry.
 * [297A-14] El editor sale del monolito Admin y recibe articleId interno por params.
 * [297A-14] La ventana monta loading inmediatamente y luego hidrata Tiptap.
 * [297A-14 F5] UI (toolbar/portada), tipos y autosave viven en módulos propios;
 * este archivo solo orquesta el lifecycle. Autosave: borrador automático
 * (create→update idempotente) sin tocar el estado editorial. */

import { ArticleService } from '../../../../services';
import { createInput } from '../../../../components/ui/input';
import { createTextarea } from '../../../../components/ui/textarea';
import { createSelect } from '../../../../components/ui/select';
import { createEl } from '../../../../utils/dom';
import { createVacio } from '../../../../components/ui/empty-state';
import { safeClick, safeRun } from '../../../../utils/safe-async';
import { showToast } from '../../../../components/ui/toast';
import { tryCatch } from '../../../../utils/result';
import { publishArticleEditorSaved } from '../../../runtime/article-editor-events';
import type { MountedView, RenderContext } from '../../../../core/lifecycle';
import type { Article } from '../../../../api/types';
import { createToolbar, createCoverField } from './article-editor-ui';
import { createArticleAutosave, type ArticleDraftPayload } from './article-editor-autosave';
import type { EditorInstance } from './article-editor-types';

async function loadArticle(ctx: RenderContext): Promise<Article | undefined> {
  const articleId = ctx.params?.articleId;
  if (!articleId) return undefined;
  const result = await tryCatch(ArticleService.getById(articleId));
  if (!result.ok) throw new Error('No se pudo cargar el artículo');
  return result.value;
}

function createLoadingView(): HTMLElement {
  return createEl('div', { className: 'article-editor flex-columna gap-lg' },
    createEl('p', { className: 'cargando', textContent: 'cargando editor...' }),
  );
}

/**
 * Renderizar el editor para una instancia nueva o un artículo existente.
 * El contrato es síncrono para que WindowManager publique la ventana sin
 * esperar red ni chunks; la hidratación vive dentro del lifecycle de la app.
 */
export function renderArticleEditor(ctx: RenderContext): MountedView {
  const container = createLoadingView();
  /* [018A-1 F2] Franja de acciones inferior (chrome de la ventana): se crea
   * síncrona para que el shell la coloque debajo del body antes de que
   * termine la hidratación; hydrate la rellena (fijar + crear/guardar) y la
   * oculta mientras carga o si falla. El body absorbe su scroll. */
  const actionsBar = createEl('div', { className: 'desktop-window__actions' });
  actionsBar.hidden = true;
  let editor: EditorInstance | null = null;
  let disposed = false;
  /* Cleanup del autosave (timer + suscripción Tiptap). Se registra tras la
   * hidratación y se invoca en destroy; nunca como código muerto en hydrate. */
  let autosaveCleanup: (() => void) | undefined;

  const isActive = (): boolean => !disposed && !ctx.signal.aborted;
  const destroyEditor = (): void => {
    editor?.destroy();
    editor = null;
  };

  const hydrate = async (): Promise<void> => {
    try {
      const article = await loadArticle(ctx);
      if (!isActive()) return;

      const [{ Editor }, StarterKitModule, ImageModule] = await Promise.all([
        import('@tiptap/core'),
        import('@tiptap/starter-kit'),
        import('@tiptap/extension-image'),
      ]);
      if (!isActive()) return;

      let title = article?.title || '';
      let excerpt = article?.excerpt || '';
      let status = article?.status || 'draft';
      let isPinned = article?.is_pinned || false;
      let currentArticleId = article?.id;
      /* [297A-14 F5] Sincroniza la etiqueta del botón (crear/guardar) también
       * cuando el autosave crea el artículo; la referencia se asigna tras
       * crear el botón (los clicks ocurren después de la hidratación). */
      let updateSaveLabel: () => void = () => {};

      /* El autosave se crea antes de los inputs; los closures de onInput solo
       * se ejecutan al escribir (después de que autosave ya existe). */
      let autosave: ReturnType<typeof createArticleAutosave> | null = null;
      const scheduleAutosave = (): void => autosave?.schedule();

      const titleInput = createInput({
        label: 'titulo',
        placeholder: 'titulo del articulo',
        value: title,
        onInput: value => { title = value; scheduleAutosave(); },
      });
      const excerptInput = createTextarea({
        label: 'extracto',
        placeholder: 'resumen breve del articulo',
        value: excerpt,
        rows: 3,
        onInput: value => { excerpt = value; scheduleAutosave(); },
      });
      const statusSelect = createSelect({
        label: 'estado',
        options: [
          { value: 'draft', label: 'borrador' },
          { value: 'published', label: 'publicado' },
        ],
        value: status,
        onChange: value => { status = value as 'draft' | 'published'; },
      });
      const pinButton = createEl('button', {
        type: 'button',
        className: 'boton',
        textContent: isPinned ? 'fijado ✓' : 'fijar articulo',
      });
      pinButton.addEventListener('click', () => {
        if (!isActive()) return;
        isPinned = !isPinned;
        pinButton.textContent = isPinned ? 'fijado ✓' : 'fijar articulo';
      });

      /* [018A-74] El borde del campo ya lo define desktop-article-editor.css
       * (borde completo, igual que .campo-textarea); se retiró la utilidad
       * .border-bottom que solo pintaba la línea inferior. */
      const editorContainer = createEl('div', {
        className: 'article-editor__content',
        ariaLabel: 'Contenido del artículo',
      });
      /* [018A-85] createCoverField ahora recibe la URL inicial (componente
       * compartido) en lugar del artículo completo. */
      const cover = createCoverField(article?.cover_image || '', isActive, () => scheduleAutosave());
      const StarterKit = StarterKitModule.default;
      const Image = ImageModule.default;

      editor = new Editor({
        element: editorContainer,
        extensions: [StarterKit, Image.configure({ inline: false })],
        content: article?.content || { type: 'doc', content: [{ type: 'paragraph' }] },
      }) as unknown as EditorInstance;

      /* Autosave: el borrador se guarda automáticamente; el editorial
       * (status/pin) solo cambia con el guardado manual explícito. */
      autosave = createArticleAutosave({
        getArticleId: () => currentArticleId,
        setArticleId: (id) => {
          currentArticleId = id;
          updateSaveLabel();
        },
        getPayload: (): ArticleDraftPayload => ({
          title,
          excerpt,
          content: editor ? editor.getJSON() as Record<string, unknown> : { type: 'doc' },
          cover_image: cover.getValue(),
        }),
        isActive,
      });

      /* Tiptap 'update' → programar autosave (debounce 2.5s).
       * Tiptap `.on()` devuelve el editor, no un handle; se remueve con
       * `.off(event, handler)`. destroyEditor() ya limpia listeners vía
       * `editor.destroy()`; el cleanup explícito es idempotente. */
      const onEditorUpdate = (): void => autosave?.schedule();
      editor.on?.('update', onEditorUpdate);
      autosaveCleanup = () => {
        editor?.off?.('update', onEditorUpdate);
        autosave?.destroy();
      };

      const toolbar = createToolbar(editor, () => currentArticleId, isActive);
      /* [018A-1 F2] En la franja el botón es compacto (receta .boton OS), no
       * boton-grande: el tamaño lo gobierna el chrome, no el contenido. */
      const saveButton = createEl('button', {
        type: 'button',
        className: 'boton',
        textContent: currentArticleId ? 'guardar' : 'crear',
      });
      updateSaveLabel = () => {
        saveButton.textContent = currentArticleId ? 'guardar' : 'crear';
      };
      saveButton.addEventListener('click', safeClick(async () => {
        if (!isActive() || !title.trim() || !editor) {
          if (isActive() && !title.trim()) showToast('el titulo es obligatorio');
          return;
        }
        autosave?.cancel();
        const payload = {
          title,
          excerpt,
          content: editor.getJSON() as Record<string, unknown>,
          cover_image: cover.getValue(),
          status,
          is_pinned: isPinned,
        };
        const request = currentArticleId
          ? ArticleService.update(currentArticleId, payload)
          : ArticleService.create(payload);
        const result = await safeRun(request, 'error al guardar');
        if (!isActive() || !result.ok) return;
        const operation = currentArticleId ? 'updated' : 'created';
        currentArticleId = result.value.id;
        updateSaveLabel();
        publishArticleEditorSaved({
          articleId: currentArticleId,
          operation,
        });
        showToast(operation === 'updated' ? 'articulo actualizado' : 'articulo creado');
      }));

      container.textContent = '';
      container.append(titleInput, excerptInput, cover.element, toolbar, editorContainer, statusSelect);
      /* [018A-1 F2] Las acciones primarias viven en la franja inferior, no en
       * el contenido: el body absorbe su scroll y la franja queda fija. */
      actionsBar.textContent = '';
      actionsBar.append(pinButton, saveButton);
      actionsBar.hidden = false;
    } catch {
      if (!isActive()) return;
      /* Cerrar timers de autosave aunque la hidratación falle a medias. */
      autosaveCleanup?.();
      autosaveCleanup = undefined;
      destroyEditor();
      container.textContent = '';
      container.appendChild(createVacio('error al cargar el editor'));
      /* [018A-1 F2] Sin botones de acción si el editor no cargó. */
      actionsBar.hidden = true;
      actionsBar.textContent = '';
    }
  };

  void hydrate();

  const abortHandler = (): void => {
    disposed = true;
    destroyEditor();
  };
  ctx.signal.addEventListener('abort', abortHandler, { once: true });

  return {
    element: container,
    actions: actionsBar,
    destroy: () => {
      disposed = true;
      ctx.signal.removeEventListener('abort', abortHandler);
      autosaveCleanup?.();
      autosaveCleanup = undefined;
      destroyEditor();
    },
  };
}
