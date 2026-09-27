#version 440

layout (location = 0) in vec2 qt_TexCoord0;
layout (location = 0) out vec4 fragColor;

layout (std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float time;
    float volume;
    float stateMode;
};

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

float fbm(vec2 p)
{
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 4; i++) {
        value += noise(p) * amplitude;
        p = p * 2.0 + vec2(13.7, 9.1);
        amplitude *= 0.5;
    }

    return value;
}

float glow(vec2 p, vec2 center, float size)
{
    vec2 d = p - center;
    return exp(-dot(d, d) * size);
}

void main()
{
    vec2 uv = (qt_TexCoord0 - vec2(0.5)) * 2.0;
    float dist = length(uv);
    float angle = atan(uv.y, uv.x);

    float rawVolume = max(volume, 0.0);

    float activity = 1.0 - exp(-rawVolume * 5.0);
    activity = pow(clamp(activity, 0.0, 1.0), 0.75);

    float processing = clamp(stateMode, 0.0, 1.0);

    float innerActivity = 1.0 - exp(-rawVolume * 3.0);
    innerActivity = clamp(innerActivity, 0.0, 1.0);

    float t = time;
    float innerT = time * (1.0 + innerActivity * 0.85);

    float contourNoise = fbm(
        vec2(cos(angle), sin(angle)) * 1.35 +
        vec2(t * 0.045, -t * 0.035)
    );

    float wave1 = sin(angle * 3.0 + t * 0.75);
    float wave2 = sin(angle * 5.0 - t * 0.52 + 1.7);
    float wave3 = sin(angle * 7.0 + t * 0.38 + 3.1);

    float organicWave =
    wave1 * 0.009 +
    wave2 * 0.005 +
    wave3 * 0.003;

    float radius =
    0.70 +
    sin(t * 0.55) * (0.006 + activity * 0.018) +
    (contourNoise - 0.5) * (0.016 + activity * 0.060) +
    organicWave * (0.55 + activity * 1.8);

    radius = clamp(radius, 0.64, 0.77);

    float innerBlur = 0.050 + activity * 0.020;

    float coreMask = 1.0 - smoothstep(
        radius - innerBlur,
        radius + innerBlur,
        dist
    );

    float haloWidth = 0.10 + activity * 0.035;

    float haloMask = 1.0 - smoothstep(
        radius,
        radius + haloWidth,
        dist
    );

    float outerHalo = haloMask * (1.0 - coreMask);

    float alpha =
    coreMask +
    outerHalo * (0.08 + activity * 0.07);

    if (alpha <= 0.001)
    discard;

    float surfaceDist = min(dist, radius);
    float z = sqrt(max(0.0, radius * radius - surfaceDist * surfaceDist));

    vec3 normal = normalize(vec3(uv, z));
    vec2 p = normal.xy;

    float innerMotion = 0.012 + innerActivity * 0.095;

    vec2 drift = vec2(
    fbm(p * 1.2 + vec2(innerT * 0.035, -innerT * 0.024)),
    fbm(p * 1.2 + vec2(-innerT * 0.028, innerT * 0.040))
    );

    p += (drift - 0.5) * (innerMotion * 0.55);

    float swirl = innerT * (0.012 + innerActivity * 0.045);

    mat2 rotation = mat2(
    cos(swirl), -sin(swirl),
    sin(swirl), cos(swirl)
    );

    p = rotation * p;

    vec3 turquoise = vec3(0.125, 0.882, 0.835);
    vec3 cyan = vec3(0.000, 0.769, 1.000);
    vec3 pink = vec3(1.000, 0.110, 0.537);
    vec3 blue = vec3(0.059, 0.357, 1.000);
    vec3 violet = vec3(0.204, 0.039, 0.282);
    vec3 black = vec3(0.002, 0.001, 0.008);

    vec3 color = vec3(0.045, 0.012, 0.14);

    float turquoiseGlow = glow(
        p,
        vec2(
        -0.30 + sin(innerT * 0.19) * innerMotion,
        0.30 + cos(innerT * 0.13) * innerMotion
        ),
        5.0
    );

    float cyanGlow = glow(
        p,
        vec2(
        -0.38 + cos(innerT * 0.11) * innerMotion,
        -0.28 + sin(innerT * 0.17) * innerMotion
        ),
        5.5
    );

    float pinkGlow = glow(
        p,
        vec2(
        0.30 + cos(innerT * 0.16) * innerMotion,
        0.16 - sin(innerT * 0.21) * innerMotion
        ),
        5.0
    );

    float blueGlow = glow(
        p,
        vec2(
        0.28 - sin(innerT * 0.14) * innerMotion,
        -0.30 + cos(innerT * 0.10) * innerMotion
        ),
        5.5
    );

    float violetGlow = glow(
        p,
        vec2(
        0.02 + sin(innerT * 0.12) * 0.20,
        0.0
        ),
        3.2
    );

    color = mix(color, violet, violetGlow * 0.72);
    color = mix(color, blue, blueGlow * 0.78);
    color = mix(color, turquoise, turquoiseGlow * 0.88);
    color = mix(color, cyan, cyanGlow * 0.82);
    color = mix(color, pink, pinkGlow * 0.88);

    float purpleCloud = glow(
        p,
        vec2(
        -0.02 + cos(innerT * 0.08) * innerMotion,
        0.22 + sin(innerT * 0.12) * innerMotion
        ),
        2.4
    );

    float cyanCloud = glow(
        p,
        vec2(
        -0.12 + sin(innerT * 0.10) * innerMotion,
        -0.08 + cos(innerT * 0.07) * innerMotion
        ),
        2.8
    );

    color = mix(color, violet, purpleCloud * 0.32);
    color = mix(color, turquoise, cyanCloud * 0.28);

    float shadow = glow(
        p,
        vec2(
        0.08 + sin(t * 0.09) * 0.16,
        -0.18 + cos(t * 0.11) * 0.14
        ),
        2.2
    );

    color = mix(color, black, shadow * (0.10 + activity * 0.06));

    // Анимация анализа: оранжево-жёлтые частицы по кругу.
    float loadingTime = time * 0.85;

    vec3 orange = vec3(1.0, 0.20, 0.01);
    vec3 amber = vec3(1.0, 0.52, 0.02);
    vec3 yellow = vec3(1.0, 0.90, 0.18);

    float loadingLight = 0.0;
    vec3 loadingColor = vec3(0.10, 0.018, 0.002);

    for (int i = 0; i < 6; i++) {
        float fi = float(i);
        float phase = loadingTime + fi * 1.0472;

        vec2 orbitCenter = vec2(
        cos(phase) * 0.34,
        sin(phase) * 0.34
        );

        float particle = glow(p, orbitCenter, 10.0);
        vec3 particleColor = mix(
            orange,
            yellow,
            0.5 + 0.5 * sin(phase + fi)
        );

        loadingColor += particleColor * particle;
        loadingLight += particle;
    }

    float loadingCore = glow(
        p,
        vec2(
        cos(loadingTime * 0.7) * 0.06,
        sin(loadingTime * 0.7) * 0.06
        ),
        3.0
    );

    loadingColor += amber * loadingCore * 0.35;
    loadingColor = clamp(loadingColor, 0.0, 1.0);

    color = mix(color, loadingColor, processing * 0.92);

    float frontLight = pow(max(normal.z, 0.0), 1.6);
    float rimLight = pow(1.0 - max(normal.z, 0.0), 2.3);

    color += vec3(0.025, 0.070, 0.15) * frontLight;
    color += vec3(0.025, 0.005, 0.055) * rimLight;

    vec3 haloColor = mix(
        cyan,
        pink,
        0.5 + 0.5 * sin(angle + t * 0.3)
    );

    color += haloColor * outerHalo * (0.025 + activity * 0.025);

    color *= 0.98 + activity * 0.18;
    color = clamp(color, 0.0, 1.0);

    fragColor = vec4(
    color * alpha * qt_Opacity,
    alpha * qt_Opacity
    );
}