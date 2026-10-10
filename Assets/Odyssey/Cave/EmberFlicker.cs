using UnityEngine;

/// <summary>炭火光的隨機強度擺動（±20%）。</summary>
public class EmberFlicker : MonoBehaviour
{
    public float baseIntensity = 3f;
    public float amount = 0.2f;

    Light target;
    float current;
    float goal;

    void Awake() => target = GetComponent<Light>();

    void Update()
    {
        if (target == null)
            return;
        if (Mathf.Abs(current - goal) < 0.01f)
            goal = Random.Range(1f - amount, 1f + amount);
        current = Mathf.MoveTowards(current, goal, Time.deltaTime * 2f);
        target.intensity = baseIntensity * current;
    }
}
