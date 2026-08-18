/* wandori.us — Clipboard Tests
 * [Auditoría v4 §6.1] Tests para lógica pura de wouldCreateCycle. */

import { describe, it, expect } from 'vitest';
import { wouldCreateCycle } from './clipboard';
import type { ResolvedNode } from './types';

function makeNode(id: string, parentId: string | 'desktop' | null): ResolvedNode {
  return {
    id,
    parentId,
    type: 'folder',
    label: id,
    origin: 'release',
  };
}

describe('wouldCreateCycle', () => {
  it('devuelve false cuando newParentId es desktop o null', () => {
    const nodes: Record<string, ResolvedNode> = {};
    expect(wouldCreateCycle(nodes, 'a', 'desktop')).toBe(false);
    expect(wouldCreateCycle(nodes, 'a', null)).toBe(false);
  });

  it('devuelve true cuando newParentId es el mismo nodo', () => {
    const nodes: Record<string, ResolvedNode> = {
      a: makeNode('a', 'desktop'),
    };
    expect(wouldCreateCycle(nodes, 'a', 'a')).toBe(true);
  });

  it('devuelve true cuando el padre es hijo del nodo (ciclo directo)', () => {
    const nodes: Record<string, ResolvedNode> = {
      a: makeNode('a', 'desktop'),
      b: makeNode('b', 'a'),
    };
    expect(wouldCreateCycle(nodes, 'a', 'b')).toBe(true);
  });

  it('devuelve true cuando hay un ciclo a traves de varios niveles', () => {
    const nodes: Record<string, ResolvedNode> = {
      a: makeNode('a', 'desktop'),
      b: makeNode('b', 'a'),
      c: makeNode('c', 'b'),
    };
    expect(wouldCreateCycle(nodes, 'a', 'c')).toBe(true);
  });

  it('devuelve false cuando no hay ciclo (nodos separados)', () => {
    const nodes: Record<string, ResolvedNode> = {
      a: makeNode('a', 'desktop'),
      b: makeNode('b', 'desktop'),
    };
    expect(wouldCreateCycle(nodes, 'a', 'b')).toBe(false);
  });

  it('no crea ciclo cuando el destino es un nodo no ancestro', () => {
    const nodes: Record<string, ResolvedNode> = {
      a: makeNode('a', 'b'),
      b: makeNode('b', 'desktop'),
    };
    expect(wouldCreateCycle(nodes, 'a', 'b')).toBe(false);
  });

  it('devuelve true cuando el destino es hijo del nodo (ciclo indirecto)', () => {
    const nodes: Record<string, ResolvedNode> = {
      a: makeNode('a', 'desktop'),
      b: makeNode('b', 'a'),
      c: makeNode('c', 'b'),
      d: makeNode('d', 'c'),
    };
    // Mover d bajo a: a → d → ... → a? No, d → c → b → a, no es ciclo
    // Mover a bajo d: a → d → c → b → a SÍ es ciclo
    expect(wouldCreateCycle(nodes, 'a', 'd')).toBe(true);
  });

  it('detecta ciclos con nodos que apuntan a null (papelera)', () => {
    const nodes: Record<string, ResolvedNode> = {
      a: makeNode('a', null),
      b: makeNode('b', 'a'),
    };
    expect(wouldCreateCycle(nodes, 'a', 'b')).toBe(true);
  });

  it('no se cicla con objetos vacios', () => {
    const nodes: Record<string, ResolvedNode> = {};
    // Si no hay nodos, no puede haber ciclo
    expect(wouldCreateCycle(nodes, 'a', 'b')).toBe(false);
  });
});
