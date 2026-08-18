/* wandori.us — Mobile visual prototype (legacy reference)
 * [297A-12] Concepto navegable para aprobar launcher, apps dominantes y Back/Home.
 * Gotcha: usa contenido de muestra deliberadamente; no persiste estado ni sustituye
 * MobileAppStack, AppRegistry o los comandos compartidos del runtime final. */

import {
  ArrowLeft,
  Circle,
  FileText,
  Folder,
  FolderCode,
  Image,
  Package,
  PanelLeftOpen,
  ShoppingBag,
  Trash2,
  UserRound,
  createElement,
  type IconNode,
} from 'lucide';
import { createEl } from '../../utils/dom';

type PrototypeScreen = 'launcher' | 'profile' | 'gallery' | 'reader' | 'store' | 'checkout';

export interface MobilePrototype {
  readonly element: HTMLElement;
  readonly routerOutlet: HTMLElement;
}

interface LauncherItem {
  readonly label: string;
  readonly icon: IconNode;
  readonly screen?: PrototypeScreen;
  readonly onActivate?: () => void;
}

export function createMobilePrototype(
  profile: HTMLElement,
  onToggleExternalNav: () => void,
): MobilePrototype {
  const shell = createEl('section', { className: 'movilOs', ariaLabel: 'Sistema móvil' });
  const viewport = createEl('div', { className: 'movilOs__viewport' });
  const routerOutlet = createEl('main', { className: 'movilOs__routerOutlet', ariaHidden: 'true' });
  let currentScreen: PrototypeScreen = 'launcher';

  function navigate(screen: PrototypeScreen): void {
    currentScreen = screen;
    render();
  }

  function createIconButton(item: LauncherItem): HTMLButtonElement {
    const button = createEl('button', {
      type: 'button', className: 'movilLauncher__app', ariaLabel: `Abrir ${item.label}`,
    });
    const icon = createElement(item.icon);
    icon.classList.add('movilLauncher__icono');
    button.append(
      createEl('span', { className: 'movilLauncher__pictograma', ariaHidden: 'true' }, icon),
      createEl('span', { className: 'movilLauncher__etiqueta', textContent: item.label }),
    );
    button.addEventListener('click', () => item.onActivate?.() ?? navigate(item.screen ?? 'launcher'));
    return button;
  }

  function createNavigation(): HTMLElement {
    const navigation = createEl('nav', { className: 'movilNavegacion', ariaLabel: 'Navegación del sistema' });
    const back = createEl('button', { type: 'button', className: 'movilNavegacion__control', ariaLabel: 'Atrás' }, createElement(ArrowLeft));
    const home = createEl('button', { type: 'button', className: 'movilNavegacion__control', ariaLabel: 'Ir al inicio' }, createElement(Circle));
    back.disabled = currentScreen === 'launcher';
    back.addEventListener('click', () => navigate('launcher'));
    home.addEventListener('click', () => navigate('launcher'));
    navigation.append(back, home);
    return navigation;
  }

  function createAppHeader(title: string): HTMLElement {
    return createEl('header', { className: 'movilApp__cabecera' },
      createEl('span', { className: 'movilMarca', ariaHidden: 'true' }),
      createEl('h1', { className: 'movilApp__titulo', textContent: title }),
      createEl('span', { ariaHidden: 'true' }),
    );
  }

  function renderLauncher(): HTMLElement {
    const items: LauncherItem[] = [
      { label: 'Galería', icon: Folder, screen: 'gallery' },
      { label: 'Proyectos', icon: FolderCode, screen: 'gallery' },
      { label: 'Perfil', icon: UserRound, screen: 'profile' },
      { label: 'Artículos', icon: FileText, screen: 'reader' },
      { label: 'Tienda', icon: ShoppingBag, screen: 'store' },
      { label: 'Papelera', icon: Trash2, screen: 'gallery' },
      { label: 'Navegación', icon: PanelLeftOpen, onActivate: onToggleExternalNav },
    ];
    const launcher = createEl('div', { className: 'movilLauncher' });
    const header = createEl('header', { className: 'movilLauncher__cabecera' },
      createEl('span', { className: 'movilMarca', ariaHidden: 'true' }),
      createEl('p', { className: 'movilLauncher__fecha', textContent: 'inicio' }),
    );
    const grid = createEl('div', { className: 'movilLauncher__grid', role: 'list' });
    items.forEach((item) => grid.appendChild(createIconButton(item)));
    launcher.append(header, grid);
    return launcher;
  }

  function renderProfile(): HTMLElement {
    const content = createEl('div', { className: 'movilApp__contenido movilPerfil' });
    content.appendChild(profile);
    return createEl('div', { className: 'movilApp' }, createAppHeader('Perfil'), content);
  }

  function createFile(label: string, icon: IconNode, action?: () => void): HTMLElement {
    const button = createEl('button', { type: 'button', className: 'movilCarpeta__archivo', ariaLabel: label });
    const pictogram = createElement(icon);
    pictogram.classList.add('movilCarpeta__icono');
    button.append(pictogram, createEl('span', { textContent: label }));
    if (action) button.addEventListener('click', action);
    return button;
  }

  function renderGallery(): HTMLElement {
    const grid = createEl('div', { className: 'movilCarpeta__grid' },
      createFile('Retrato 01', Image),
      createFile('Estudio B/N', Image),
      createFile('Notas de julio', FileText, () => navigate('reader')),
      createFile('Colección', Folder),
      createFile('Proyecto 01', Package),
      createFile('Boceto.txt', FileText, () => navigate('reader')),
    );
    const content = createEl('div', { className: 'movilApp__contenido movilCarpeta' },
      createEl('p', { className: 'movilCarpeta__ruta', textContent: 'Escritorio / Galería' }),
      grid,
    );
    return createEl('div', { className: 'movilApp' }, createAppHeader('Galería'), content);
  }

  function renderReader(): HTMLElement {
    const article = createEl('article', { className: 'movilArticulo' },
      createEl('p', { className: 'movilArticulo__meta', textContent: '29 julio 2026 · 4 min' }),
      createEl('h2', { className: 'movilArticulo__titulo', textContent: 'Una interfaz que se siente viva' }),
      createEl('div', { className: 'movilArticulo__imagen', role: 'img', ariaLabel: 'Composición abstracta monocroma' }),
      createEl('p', { textContent: 'El sistema empieza como una superficie sencilla: archivos, carpetas y programas comparten el mismo lenguaje.' }),
      createEl('blockquote', { textContent: 'Menos decoración. Más estructura, ritmo y respuesta.' }),
      createEl('p', { textContent: 'En móvil, cada pieza ocupa la pantalla completa y el contenido sigue siendo el centro.' }),
    );
    return createEl('div', { className: 'movilApp' }, createAppHeader('Lector'), createEl('div', { className: 'movilApp__contenido' }, article));
  }

  function renderStore(): HTMLElement {
    const buy = createEl('button', { type: 'button', className: 'movilAccion', textContent: 'Comprar — $8' });
    buy.addEventListener('click', () => navigate('checkout'));
    const product = createEl('article', { className: 'movilProducto' },
      createEl('div', { className: 'movilProducto__imagen', role: 'img', ariaLabel: 'Vista previa del paquete Fragmentos 01' }),
      createEl('p', { className: 'movilProducto__tipo', textContent: 'ARCHIVO DIGITAL' }),
      createEl('h2', { className: 'movilProducto__titulo', textContent: 'Fragmentos 01' }),
      createEl('p', { textContent: 'Una pequeña colección de texturas y notas visuales.' }),
      buy,
    );
    return createEl('div', { className: 'movilApp' }, createAppHeader('Tienda'), createEl('div', { className: 'movilApp__contenido' }, product));
  }

  function renderCheckout(): HTMLElement {
    const form = createEl('div', { className: 'movilCompra' },
      createEl('p', { className: 'movilCompra__resumen', textContent: 'Fragmentos 01  ·  $8' }),
      createEl('label', { className: 'movilCampo', textContent: 'Correo' }, createEl('input', { type: 'email', placeholder: 'tu@correo.com' })),
      createEl('label', { className: 'movilCampo', textContent: 'Tarjeta' }, createEl('input', { type: 'text', placeholder: '••••  ••••  ••••  ••••' })),
      createEl('button', { type: 'button', className: 'movilAccion', textContent: 'Pagar $8' }),
      createEl('p', { className: 'movilCompra__nota', textContent: 'Vista previa visual. No procesa pagos.' }),
    );
    return createEl('div', { className: 'movilApp' }, createAppHeader('Compra'), createEl('div', { className: 'movilApp__contenido' }, form));
  }

  function render(): void {
    viewport.innerHTML = '';
    const screen = currentScreen === 'launcher' ? renderLauncher()
      : currentScreen === 'profile' ? renderProfile()
      : currentScreen === 'gallery' ? renderGallery()
      : currentScreen === 'reader' ? renderReader()
      : currentScreen === 'store' ? renderStore()
      : renderCheckout();
    viewport.append(screen, createNavigation());
  }

  render();
  shell.append(viewport, routerOutlet);
  return { element: shell, routerOutlet };
}
