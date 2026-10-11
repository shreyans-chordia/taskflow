import type * as THREE from 'three';

/**
 * Names that WebGL reports when it is drawing on the CPU instead of a graphics card: Chrome's SwiftShader,
 * Mesa's llvmpipe/softpipe on Linux, and Windows' Basic Render Driver (no GPU driver installed).
 */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export function isSoftwareRenderer(gl: THREE.WebGLRenderer): boolean {
  const ctx = gl.getContext();
  const info = ctx.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(ctx.getParameter(ctx.RENDERER));
  return SOFTWARE.test(name);
}

/*
 * Without a graphics card every frame and every blurred pane is computed on the CPU, which makes the room crawl.
 * The desk then switches to "light" quality: the same room without shadows, at 1x pixel density, and solid paper
 * instead of live frosted glass (`:root[data-quality="light"]` in desk.css).
 */
