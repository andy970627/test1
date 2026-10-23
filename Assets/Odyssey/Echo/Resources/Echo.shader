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

        struct Attributes { float4 positionOS : POSITION; };
        struct Varyings { float4 positionCS : SV_POSITION; float3 positionWS : TEXCOORD0; };

        Varyings vert(Attributes v)
        {
            Varyings o;
            o.positionWS = TransformObjectToWorld(v.positionOS.xyz);
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
                return half4(_BaseColor.rgb * lit * 2 + ring * 0.6, 1);
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

            half4 fragDepthNormals(Varyings i) : SV_Target
            {
                return half4(0, 0, 1, 0);
            }
            ENDHLSL
        }
    }
}
