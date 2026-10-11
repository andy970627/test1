using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 蹲姿第一人稱：WASD 慢速移動、滑鼠環顧，並回報本幀發出的聲量。
/// 直接讀 Input System 裝置，不依賴 Action 設定。
/// </summary>
[RequireComponent(typeof(CharacterController))]
public class FirstPersonPlayer : MonoBehaviour
{
    public float walkSpeed = 1.2f;
    public float lookSensitivity = 0.08f;
    public float moveNoise = 0.3f;
    public bool InputEnabled { get; set; } = true;

    CharacterController controller;
    Transform cameraTransform;
    float pitch;
    float verticalVelocity;
    bool bodyActive = true;

    public Transform CameraTransform => cameraTransform;
    public Camera Camera { get; private set; }

    /// <summary>本幀有水平位移時為 moveNoise，否則 0。</summary>
    public float CurrentNoise { get; private set; }

    void Awake()
    {
        controller = GetComponent<CharacterController>();
        controller.height = 1.0f;
        controller.radius = 0.3f;
        controller.center = new Vector3(0f, 0.5f, 0f);

        var camGo = new GameObject("PlayerCamera");
        cameraTransform = camGo.transform;
        cameraTransform.SetParent(transform, false);
        cameraTransform.localPosition = new Vector3(0f, 0.85f, 0f);
        camGo.tag = "MainCamera";
        Camera = camGo.AddComponent<Camera>();
        Camera.clearFlags = CameraClearFlags.SolidColor;
        Camera.backgroundColor = Color.black;
        Camera.nearClipPlane = 0.05f;
        Camera.fieldOfView = 70f;
        camGo.AddComponent<AudioListener>();
    }

    void Start() => LockCursor(true);

    /// <summary>額外加在鏡頭上的效果（推巨石時前傾、震動）；預設 0，不影響視角本身。</summary>
    public float FeelPitch { get; set; }
    public Vector3 FeelOffset { get; set; }

    static readonly Vector3 CameraHeight = new(0f, 0.85f, 0f);

    void LateUpdate()
    {
        cameraTransform.localEulerAngles = new Vector3(pitch + FeelPitch, 0f, 0f);
        cameraTransform.localPosition = CameraHeight + FeelOffset;
    }

    void Update()
    {
        CurrentNoise = 0f;
        var keyboard = Keyboard.current;
        var mouse = Mouse.current;
        if (keyboard == null || mouse == null)
            return;

        if (keyboard.escapeKey.wasPressedThisFrame)
            LockCursor(false);
        else if (mouse.leftButton.wasPressedThisFrame && Cursor.lockState != CursorLockMode.Locked)
            LockCursor(true);

        if (!InputEnabled || !bodyActive)
            return;

        if (Cursor.lockState == CursorLockMode.Locked)
        {
            Vector2 look = mouse.delta.ReadValue() * lookSensitivity;
            transform.Rotate(0f, look.x, 0f);
            pitch = Mathf.Clamp(pitch - look.y, -80f, 80f);
            cameraTransform.localEulerAngles = new Vector3(pitch, 0f, 0f);
        }

        var input = new Vector3(
            (keyboard.dKey.isPressed ? 1f : 0f) - (keyboard.aKey.isPressed ? 1f : 0f),
            0f,
            (keyboard.wKey.isPressed ? 1f : 0f) - (keyboard.sKey.isPressed ? 1f : 0f));
        Vector3 move = transform.TransformDirection(Vector3.ClampMagnitude(input, 1f)) * walkSpeed;

        verticalVelocity = controller.isGrounded ? -1f : verticalVelocity - 9.81f * Time.deltaTime;
        Vector3 before = transform.position;
        move.y = verticalVelocity;
        controller.Move(move * Time.deltaTime);

        Vector3 delta = transform.position - before;
        delta.y = 0f;
        if (delta.sqrMagnitude > 1e-6f)
            CurrentNoise = moveNoise;
    }

    /// <summary>停用／啟用身體（碰撞與移動），不動鏡頭。鑽到羊肚下時停用。</summary>
    public void SetBodyActive(bool active)
    {
        bodyActive = active;
        controller.enabled = active;
    }

    public void Teleport(Vector3 position, float yaw)
    {
        controller.enabled = false;
        transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));
        pitch = 0f;
        cameraTransform.localEulerAngles = Vector3.zero;
        controller.enabled = bodyActive;
    }

    public void FaceTowards(Vector3 worldPoint)
    {
        Vector3 dir = worldPoint - cameraTransform.position;
        transform.rotation = Quaternion.Euler(0f, Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg, 0f);
        pitch = -Mathf.Asin(dir.normalized.y) * Mathf.Rad2Deg;
        cameraTransform.localEulerAngles = new Vector3(pitch, 0f, 0f);
    }

    static void LockCursor(bool locked)
    {
        Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
        Cursor.visible = !locked;
    }
}
