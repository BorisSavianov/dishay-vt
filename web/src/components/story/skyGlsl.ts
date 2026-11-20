// One sky model shared by the sky dome and the terrain's fog, so edges and haze blend into the real sky colour.
export const SKY_GLSL = /* glsl */ `
  vec3 skyColor(vec3 d, float dusk, float smog, float clear, float bg) {
    float h = clamp(d.y, -0.2, 1.0);
    vec3 zenith = vec3(0.03, 0.035, 0.11);
    vec3 band = vec3(0.16, 0.13, 0.32);
    vec3 horizon = vec3(0.5, 0.29, 0.27);
    vec2 flat2 = normalize(d.xz + vec2(1e-5));
    float sunward = pow(max(dot(flat2, normalize(vec2(-0.8, -0.6))), 0.0), 3.0);
    vec3 duskC = mix(band, zenith, smoothstep(0.02, 0.55, h));
    duskC = mix(duskC, horizon, (1.0 - smoothstep(-0.02, 0.22, h)) * (0.25 + 0.6 * sunward));
    vec3 smogC = mix(vec3(0.33, 0.3, 0.27), vec3(0.18, 0.17, 0.17), smoothstep(0.0, 0.6, h));
    vec3 dayC = mix(vec3(0.93, 0.94, 1.0), vec3(0.62, 0.7, 0.98), smoothstep(0.0, 0.7, h));
    vec3 col = mix(duskC, smogC, smog * 0.85);
    col = mix(col, dayC, clear);
    // Chapter 3: a deep night map backdrop for the sensors over Bulgaria.
    return mix(col, vec3(0.025, 0.03, 0.09), bg * 0.92);
  }
`;
