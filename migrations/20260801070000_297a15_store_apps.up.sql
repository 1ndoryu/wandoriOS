-- [297A-15] Add the public commerce programs to existing workspace releases.
-- `||` only adds missing keys; an admin's published placement is preserved.
UPDATE workspace_releases
SET tree = jsonb_set(
    tree,
    '{nodes}',
    COALESCE(tree->'nodes', '{}'::jsonb) || jsonb_build_object(
        'store', jsonb_build_object('id','store','parentId','desktop','type','app','label','Tienda','refId','store','position',jsonb_build_object('col',1,'row',3),'mobilePosition',jsonb_build_object('col',1,'row',3),'mobileOrder',9,'requires','public'),
        'orders', jsonb_build_object('id','orders','parentId','desktop','type','app','label','Pedidos','refId','orders','position',jsonb_build_object('col',1,'row',4),'mobilePosition',jsonb_build_object('col',2,'row',3),'mobileOrder',10,'requires','public'),
        'downloads', jsonb_build_object('id','downloads','parentId','desktop','type','app','label','Descargas','refId','downloads','position',jsonb_build_object('col',1,'row',5),'mobilePosition',jsonb_build_object('col',0,'row',4),'mobileOrder',11,'requires','public')
    )
)
WHERE version = (SELECT MAX(version) FROM workspace_releases);
