// GLSL ES 3.00 shader sources for the gallery renderer:
//  - `lit`: Blinn-Phong + tangent-space normal mapping, multiple point
//    lights, with a secondary bright-pass output for bloom.
//  - `emissive`: camera-facing glowing billboards for light fixtures.
//  - `blur`: separable Gaussian blur pass (bloom downsample chain).
//  - `composite`: combines scene + bloom, tonemaps, gamma-corrects, vignette.

export const MAX_LIGHTS = 16;

export const litVert = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aTangent;
layout(location = 3) in vec2 aUV;

uniform mat4 uViewProj;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vTangent;
out vec2 vUV;

void main() {
  vWorldPos = aPosition;
  vNormal = aNormal;
  vTangent = aTangent;
  vUV = aUV;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const litFrag = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vTangent;
in vec2 vUV;

uniform sampler2D uDiffuseMap;
uniform sampler2D uNormalMap;
uniform vec3 uCameraPos;
uniform vec3 uAmbient;
uniform vec3 uTint;
uniform float uShininess;
uniform float uNormalStrength;

uniform int uLightCount;
uniform vec3 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightColor[${MAX_LIGHTS}];
uniform float uLightIntensity[${MAX_LIGHTS}];

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outBright;

void main() {
  vec3 N = normalize(vNormal);
  vec3 T = normalize(vTangent - N * dot(vTangent, N));
  vec3 B = cross(N, T);
  mat3 TBN = mat3(T, B, N);

  vec3 nmap = texture(uNormalMap, vUV).xyz * 2.0 - 1.0;
  nmap.xy *= uNormalStrength;
  vec3 worldNormal = normalize(TBN * normalize(nmap));

  vec3 albedo = texture(uDiffuseMap, vUV).rgb * uTint;
  vec3 viewDir = normalize(uCameraPos - vWorldPos);

  vec3 result = uAmbient * albedo;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toLight = uLightPos[i] - vWorldPos;
    float dist = length(toLight);
    vec3 L = toLight / max(dist, 0.001);
    float atten = uLightIntensity[i] / (1.0 + 0.3 * dist + 0.15 * dist * dist);

    float ndotl = max(dot(worldNormal, L), 0.0);
    vec3 diffuse = ndotl * albedo;

    vec3 halfVec = normalize(L + viewDir);
    float spec = pow(max(dot(worldNormal, halfVec), 0.0), uShininess);

    result += (diffuse + spec * 0.35) * uLightColor[i] * atten;
  }

  outColor = vec4(result, 1.0);

  float brightness = max(max(result.r, result.g), result.b);
  float bloomAmount = smoothstep(1.1, 2.0, brightness);
  outBright = vec4(result * bloomAmount, 1.0);
}
`;

export const emissiveVert = `#version 300 es
layout(location = 0) in vec2 aCorner;

uniform mat4 uViewProj;
uniform vec3 uCenter;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform float uSize;

out vec2 vUV;

void main() {
  vUV = aCorner;
  vec3 worldPos = uCenter + uCameraRight * aCorner.x * uSize + uCameraUp * aCorner.y * uSize;
  gl_Position = uViewProj * vec4(worldPos, 1.0);
}
`;

export const emissiveFrag = `#version 300 es
precision highp float;

in vec2 vUV;
uniform vec3 uColor;
uniform float uIntensity;

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outBright;

void main() {
  float d = length(vUV);
  float glow = smoothstep(1.0, 0.0, d);
  glow = pow(glow, 1.8);
  vec3 c = uColor * uIntensity * glow;
  outColor = vec4(c, glow);
  outBright = vec4(c, glow);
}
`;

export const blurVert = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUV;
void main() {
  vUV = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const blurFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDirection; // texel-space blur direction
out vec4 outColor;

void main() {
  // 9-tap Gaussian.
  float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec2 texel = uDirection;
  vec3 sum = texture(uTex, vUV).rgb * weights[0];
  for (int i = 1; i < 5; i++) {
    vec2 offset = texel * float(i);
    sum += texture(uTex, vUV + offset).rgb * weights[i];
    sum += texture(uTex, vUV - offset).rgb * weights[i];
  }
  outColor = vec4(sum, 1.0);
}
`;

export const compositeVert = blurVert;

export const compositeFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
out vec4 outColor;

void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 bloom = texture(uBloom, vUV).rgb;
  vec3 color = (scene + bloom * uBloomStrength) * uExposure;

  // Reinhard tonemap + gamma correction.
  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0 / 2.2));

  // Subtle vignette.
  vec2 d = vUV - 0.5;
  float vignette = 1.0 - dot(d, d) * 0.6;
  color *= vignette;

  outColor = vec4(color, 1.0);
}
`;
