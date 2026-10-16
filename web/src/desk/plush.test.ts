import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { squeezeAt } from './objects';

/** The desk buddy's squeeze: squash and stretch that settles back to rest (decorative, no requirement ID). */
describe('plush squeeze', () => {
  it('squashes, wobbles, then comes to rest exactly', () => {
    const body = new THREE.Group();
    expect(squeezeAt(body, 0)).toBe(false);
    squeezeAt(body, 0.09); // a quarter of the first bounce
    expect(body.scale.y).toBeLessThan(0.9);
    expect(body.scale.x).toBeGreaterThan(1.05);
    expect(body.rotation.z).not.toBe(0);
    expect(squeezeAt(body, 0.9)).toBe(true);
    expect(body.scale.toArray()).toEqual([1, 1, 1]);
    expect(body.rotation.z).toBe(0);
  });
});
