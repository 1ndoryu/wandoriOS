import { beforeEach, describe, expect, it } from 'vitest';
import {
  _getTransientSnapshotCountForTest,
  captureTransientState,
  clearTransientState,
  restoreTransientState,
} from './transient-state';

const key = { appId: 'transient-test', params: { resourceId: 'one' } };

describe('transient presentation state', () => {
  beforeEach(() => {
    clearTransientState();
  });

  it('restaura valores, selección y scroll una sola vez', () => {
    const first = document.createElement('section');
    first.innerHTML = `
      <input type="text" value="" data-transient="true">
      <input type="checkbox" data-transient="true">
      <select data-transient="true"><option>uno</option><option>dos</option></select>
      <article data-transient-scroll></article>
    `;
    const text = first.querySelector('input[type="text"]') as HTMLInputElement;
    const checkbox = first.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const select = first.querySelector('select') as HTMLSelectElement;
    const article = first.querySelector('article') as HTMLElement;
    text.value = 'borrador';
    checkbox.checked = true;
    select.selectedIndex = 1;
    article.scrollTop = 240;
    article.scrollLeft = 12;

    captureTransientState(first, key);

    const second = document.createElement('section');
    second.innerHTML = `
      <input type="text" data-transient="true">
      <input type="checkbox" data-transient="true">
      <select data-transient="true"><option>uno</option><option>dos</option></select>
      <article data-transient-scroll></article>
    `;
    restoreTransientState(second, key);

    expect((second.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('borrador');
    expect((second.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect((second.querySelector('select') as HTMLSelectElement).selectedIndex).toBe(1);
    expect((second.querySelector('article') as HTMLElement).scrollTop).toBe(240);
    expect((second.querySelector('article') as HTMLElement).scrollLeft).toBe(12);
    expect(_getTransientSnapshotCountForTest()).toBe(0);
  });

  it('no captura contraseñas, archivos ni campos sensibles por metadata', () => {
    const first = document.createElement('section');
    first.innerHTML = '<input type="password" data-transient="true"><input type="file" data-transient="true"><textarea name="csrf_token" data-transient="true"></textarea><select id="card_number" data-transient="true"><option>secreto</option><option>dos</option></select><input type="text" data-transient="true">';
    (first.querySelector('input[type="password"]') as HTMLInputElement).value = 'secret';
    (first.querySelector('textarea') as HTMLTextAreaElement).value = 'token';
    (first.querySelector('select') as HTMLSelectElement).selectedIndex = 1;
    (first.querySelector('input[type="text"]') as HTMLInputElement).value = 'visible';

    captureTransientState(first, key);

    const second = document.createElement('section');
    second.innerHTML = '<input type="password" data-transient="true"><input type="file" data-transient="true"><textarea name="csrf_token" data-transient="true"></textarea><select id="card_number" data-transient="true"><option>secreto</option><option>dos</option></select><input type="text" data-transient="true">';
    restoreTransientState(second, key);

    expect((second.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('');
    expect((second.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
    expect((second.querySelector('select') as HTMLSelectElement).selectedIndex).toBe(0);
    expect((second.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('visible');
    expect(_getTransientSnapshotCountForTest()).toBe(0);
  });

  it('aísla capturas por app y parámetros', () => {
    const first = document.createElement('section');
    first.innerHTML = '<input type="text" data-transient="true">';
    (first.querySelector('input') as HTMLInputElement).value = 'uno';
    captureTransientState(first, key);

    const other = document.createElement('section');
    other.innerHTML = '<input type="text" data-transient="true">';
    restoreTransientState(other, { appId: 'transient-test', params: { resourceId: 'two' } });

    expect((other.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(_getTransientSnapshotCountForTest()).toBe(1);
  });
});
