#version 440

layout (location = 0) in vec2 qt_TexCoord0;
layout (location = 0) out vec4 fragColor;

layout (std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 u_resolution;
    vec2 u_mouse;
    vec2 u_size;
    float u_dpr;
    float cornerRadius;
};

layout (binding = 1) uniform sampler2D u_background;

float roundedBoxSDF(vec2 p, vec2 halfSize, float radius)
{
    vec2 q = abs(p) - halfSize + radius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

vec2 getNormal(vec2 p, vec2 halfSize, float radius)
{
    float stepSize = max(u_dpr * 2.0, 1.0);
    vec2 eps = vec2(stepSize, 0.0);
    vec2 gradient = vec2(
        roundedBoxSDF(p + eps.xy, halfSize, radius)
            - roundedBoxSDF(p - eps.xy, halfSize, radius),
        roundedBoxSDF(p + eps.yx, halfSize, radius)
            - roundedBoxSDF(p - eps.yx, halfSize, radius)
    );

    gradient *= 0.5 / stepSize;

    vec2 diag = vec2(
        roundedBoxSDF(p + vec2(stepSize), halfSize, radius)
            - roundedBoxSDF(p - vec2(stepSize), halfSize, radius),
        roundedBoxSDF(p + vec2(stepSize, -stepSize), halfSize, radius)
            - roundedBoxSDF(p + vec2(-stepSize, stepSize), halfSize, radius)
    ) * (0.25 / stepSize);

    gradient = mix(gradient, diag, 0.25);
    float magnitude = length(gradient);
    return magnitude > 0.001 ? gradient / magnitude : vec2(0.0);
}

vec3 blurBackground(vec2 uv)
{
    vec3 result = vec3(0.0);
    float total = 0.0;
    const float sigma = 3.0;
    vec2 texel = 2.0 / max(u_resolution, vec2(1.0));

    for (int x = -3; x <= 3; ++x) {
        for (int y = -3; y <= 3; ++y) {
            vec2 offset = vec2(float(x), float(y));
            float weight = exp(-dot(offset, offset) / (2.0 * sigma));
            result += texture(
                u_background,
                clamp(uv + offset * texel, vec2(0.0), vec2(1.0))
            ).rgb * weight;
            total += weight;
        }
    }

    return result / max(total, 0.0001);
}

void main()
{
    vec2 halfSize = max(u_size * 0.5, vec2(1.0));
    vec2 localPixels = qt_TexCoord0 * u_size - halfSize;
    vec2 screenPixels = u_mouse + localPixels;
    vec2 local = localPixels / halfSize;
    float radius = min(cornerRadius, min(halfSize.x, halfSize.y));
    float dist = roundedBoxSDF(localPixels, halfSize, radius);
    float aa = max(fwidth(dist), 1.0);
    float coverage = 1.0 - smoothstep(-aa, aa, dist);

    if (coverage <= 0.001)
        discard;

    vec2 screenUV = screenPixels / max(u_resolution, vec2(1.0));
    float r = clamp(length(local), 0.0, 1.0);

    vec2 domeSlope = normalize(local + vec2(0.0001)) * pow(r, 1.0);
    vec3 incident = vec3(0.0, 0.0, -1.0);
    vec3 domeNormal = normalize(vec3(-domeSlope * 0.7, 1.0));
    vec2 domeRefraction = refract(incident, domeNormal, 1.0 / 1.5).xy;
    vec2 domeUV = screenUV
                + domeRefraction * 0.03
                * u_size / max(u_resolution, vec2(1.0));

    float falloff = exp(-abs(dist) * 0.4);
    vec2 contourNormal = getNormal(localPixels, halfSize, radius);
    vec3 contourSurface = normalize(vec3(-contourNormal, 1.0));
    vec2 contourRefraction = refract(
        incident,
        contourSurface,
        1.0 / 1.5
    ).xy;
    vec2 contourUV = screenUV
                   + contourRefraction * 0.35 * falloff
                   * u_size / max(u_resolution, vec2(1.0));

    float edgeWeight = smoothstep(0.0, 1.0, abs(dist));
    float radialWeight = smoothstep(0.5, 1.0, r);
    float blend = clamp(edgeWeight - radialWeight * 0.5, 0.0, 1.0);
    vec2 refractUV = mix(domeUV, contourUV, blend);
    refractUV = clamp(refractUV, vec2(0.0), vec2(1.0));

    vec3 refracted = texture(u_background, refractUV).rgb;
    vec3 blurred = blurBackground(refractUV);
    vec3 base = mix(refracted, blurred, 0.5);

    float edgeFalloff = 1.0 - smoothstep(0.0, 2.0 * u_dpr, abs(dist));
    float topBand = 1.0 - smoothstep(-1.5, -0.2, local.y);
    base *= 1.0 - edgeFalloff * topBand * 0.1;

    float edgeGlow = 1.0 - smoothstep(0.0, 3.0 * u_dpr, abs(dist));
    vec3 color = mix(base, vec3(0.7), edgeGlow * 0.5);
    float alpha = 0.75 * coverage * qt_Opacity;
    fragColor = vec4(color * alpha, alpha);
}
