using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>第一人稱移動：WASD、Shift 跑步、滑鼠環顧。直接讀 Input System 裝置，不依賴 Action 設定。</summary>
[RequireComponent(typeof(CharacterController))]
public class FirstPersonPlayer : MonoBehaviour
{
    public float walkSpeed = 3f;
    public float sprintSpeed = 5.5f;
    public float lookSensitivity = 0.08f;
    public bool InputEnabled { get; set; } = true;

    CharacterController controller;
    Transform cameraTransform;
    float pitch;
    float verticalVelocity;

    public Transform CameraTransform => cameraTransform;

    void Awake()
    {
        controller = GetComponent<CharacterController>();
        controller.height = 1.7f;
        controller.radius = 0.3f;
        controller.center = new Vector3(0f, 0.85f, 0f);

        var camGo = new GameObject("PlayerCamera");
        cameraTransform = camGo.transform;
        cameraTransform.SetParent(transform, false);
        cameraTransform.localPosition = new Vector3(0f, 1.6f, 0f);
        var cam = camGo.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = Color.black;
        cam.nearClipPlane = 0.05f;
        cam.fieldOfView = 70f;
        camGo.AddComponent<AudioListener>();
    }

    void Start() => LockCursor(true);

    void Update()
    {
        var keyboard = Keyboard.current;
        var mouse = Mouse.current;
        if (keyboard == null || mouse == null)
            return;

        if (keyboard.escapeKey.wasPressedThisFrame)
            LockCursor(false);
        else if (mouse.leftButton.wasPressedThisFrame && Cursor.lockState != CursorLockMode.Locked)
            LockCursor(true);

        if (!InputEnabled)
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
        float speed = keyboard.leftShiftKey.isPressed ? sprintSpeed : walkSpeed;
        Vector3 move = transform.TransformDirection(Vector3.ClampMagnitude(input, 1f)) * speed;

        verticalVelocity = controller.isGrounded ? -1f : verticalVelocity - 9.81f * Time.deltaTime;
        move.y = verticalVelocity;
        controller.Move(move * Time.deltaTime);
    }

    public void Teleport(Vector3 position, float yaw)
    {
        controller.enabled = false;
        transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));
        pitch = 0f;
        cameraTransform.localEulerAngles = Vector3.zero;
        controller.enabled = true;
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
