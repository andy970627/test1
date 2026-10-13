using UnityEngine;

/// <summary>
/// 掛在玩家身上：走路撞上岩壁（側面碰撞、速度 &gt; 1 m/s）時通知 ScreenFeedback 輕震一下（規格第 25 節 E）。
/// </summary>
public class BumpSensor : MonoBehaviour
{
    const float MinSpeed = 1f;

    ScreenFeedback feedback;
    CharacterController controller;

    public void Init(ScreenFeedback feedback)
    {
        this.feedback = feedback;
        controller = GetComponent<CharacterController>();
    }

    void OnControllerColliderHit(ControllerColliderHit hit)
    {
        if (feedback == null || controller == null || hit.normal.y > 0.5f)
            return;
        Vector3 v = controller.velocity;
        v.y = 0f;
        if (v.magnitude > MinSpeed)
            feedback.Bump();
    }
}
