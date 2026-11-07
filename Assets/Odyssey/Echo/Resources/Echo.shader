// 回聲材質：表面平時全黑，只有被聲波掃過時亮起，2.5 秒內淡出；波前是一圈亮邊。
// 聲波清單由 EchoField 每幀寫入全域變數。
Shader "Odyssey/Echo"
{
    Properties
    {
        _BaseColor("Base Color", Color) = (0.3, 0.3, 0.3, 1)
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

        CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;
        CBUFFER_END

        struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
        struct Varyings { float4 positionCS : SV_POSITION; float3 positionWS : TEXCOORD0; float3 normalWS : TEXCOORD1; };

        Varyings vert(Attributes v)
        {
            Varyings o;
            o.positionWS = TransformObjectToWorld(v.positionOS.xyz);
            o.normalWS = TransformObjectToWorldNormal(v.normalOS);
            o.positionCS = TransformWorldToHClip(o.positionWS);
            return o;
        }
        ENDHLSL

        Pass
        {
            Name "Echo"
            Tags { "LightMode" = "UniversalForward" }
            Cull Off

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            float4 _EchoPulses[16]; // xyz = 位置，w = 開始時間
            float4 _EchoColors[16]; // rgb = 顏色，a = 半徑
            float _EchoCount;
            float _EchoNow;
            float _EchoSpread;
            float _EchoFade;
            float _EchoHear[16];    // 巨人聽得到的半徑；0 = 不畫邊

            float Hash3(float3 p)
            {
                p = frac(p * 0.1031);
                p += dot(p, p.yzx + 33.33);
                return frac((p.x + p.y) * p.z);
            }

            float ValueNoise(float3 x)
            {
                float3 c = floor(x);
                float3 f = frac(x);
                f = f * f * (3.0 - 2.0 * f);
                return lerp(
                    lerp(lerp(Hash3(c), Hash3(c + float3(1, 0, 0)), f.x),
                         lerp(Hash3(c + float3(0, 1, 0)), Hash3(c + float3(1, 1, 0)), f.x), f.y),
                    lerp(lerp(Hash3(c + float3(0, 0, 1)), Hash3(c + float3(1, 0, 1)), f.x),
                         lerp(Hash3(c + float3(0, 1, 1)), Hash3(c + float3(1, 1, 1)), f.x), f.y), f.z);
            }

            half4 frag(Varyings i) : SV_Target
            {
                float3 lit = 0;
                float3 ring = 0;
                int count = (int)_EchoCount;
                float spread = max(_EchoSpread, 0.01);
                float fade = max(_EchoFade, 0.01);
                [loop] for (int k = 0; k < count; k++)
                {
                    float age = _EchoNow - _EchoPulses[k].w;
                    if (age < 0)
                        continue;
                    float radius = max(_EchoColors[k].a, 0.01);
                    float3 color = _EchoColors[k].rgb;
                    float front = radius * saturate(age / spread);
                    float d = distance(i.positionWS, _EchoPulses[k].xyz);
                    if (d <= front)
                    {
                        float sweptAt = d / radius * spread;
                        lit += color * (1 - saturate((age - sweptAt) / fade));
                    }
                    ring += color * (1 - saturate(abs(d - front) / 0.4)) * (1 - saturate(age / fade));
                    // 難度：巨人聽得到的那一圈，波前掃到後畫一道淡淡的邊（亮度為波前的一半）。
                    float hear = _EchoHear[k];
                    if (hear > 0 && front >= min(hear, radius))
                        ring += color * 0.5 * (1 - saturate(abs(d - hear) / 0.15)) * (1 - saturate(age / fade));
                }
                // 潮濕岩壁的側掠高光（Fresnel）與細微顆粒。
                // 雙面繪製（Cull Off）：背面的法線朝外，用絕對值，否則背面整片都是最大高光。
                float3 nWS = normalize(i.normalWS);
                float3 vWS = normalize(GetCameraPositionWS() - i.positionWS);
                float NdotV = abs(dot(nWS, vWS));
                float fresnel = pow(1.0 - NdotV, 3.0) * 0.4;
                // 平滑的數值雜訊（約 12 cm 一格、格間內插）：原本每 3 cm 一格硬切，看起來像馬賽克方塊；
                // 也不用 sin 大數雜湊，網頁版（WebGL）的浮點精度下才不會亂跳。
                float grain = ValueNoise(i.positionWS * 8.0);
                float microTexture = 0.9 + 0.2 * grain;

                half3 surfaceColor = _BaseColor.rgb * microTexture;
                return half4(surfaceColor * lit * 2.0 + ring * 0.65 + fresnel * lit * 1.2, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On
            ColorMask R
            Cull Off

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment fragDepth
            half fragDepth(Varyings i) : SV_Target { return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode" = "DepthNormals" }
            ZWrite On
            Cull Off

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment fragDepthNormals
            #pragma multi_compile_fragment _ _GBUFFER_NORMALS_OCT

            // Same output as URP 17's DepthNormalsPass.hlsl: world-space normals.
            half4 fragDepthNormals(Varyings i) : SV_Target
            {
                float3 normalWS = normalize(i.normalWS);
            #if defined(_GBUFFER_NORMALS_OCT)
                float2 oct = saturate(PackNormalOctQuadEncode(normalWS) * 0.5 + 0.5);
                return half4(PackFloat2To888(oct), 0.0);
            #else
                return half4(normalWS, 0.0);
            #endif
            }
            ENDHLSL
        }
    }
}
