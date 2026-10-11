using System;
using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 黑暗中的奧德修斯：腳步、跑（受體力限制，低體力會喘氣）、拍手、丟石子、推巨石、撿石子。每個動作都會發出聲音（SoundBus）。
/// 移動與視角沿用同一個物件上的 FirstPersonPlayer。
/// </summary>
public class EchoPlayer : MonoBehaviour
{
    public const float CrouchSpeed = 1.5f;
    public const float RunSpeed = 4f;
    public const float CrouchStepSeconds = 0.6f;
    public const float RunStepSeconds = 0.35f;
    public const int MaxStones = 3;
    public const int StartStones = 1;
    public const float PushHoldSeconds = 1f;
    public const float PushReach = 1.5f;
    public const float PickupReach = 0.8f;
    const float PushFacingDot = 0.7f;

    FirstPersonPlayer body;
    Boulder boulder;
    IReadOnlyList<StonePickup> pickups;
    Func<bool> boulderOpen;
    CharacterController controller;
    Vector3 lastPosition;
    float stepTimer;
    float pushHold;
    bool wasLocked;
    bool inputEnabled;

    public int Stones { get; private set; } = StartStones;
    public Stamina Stamina { get; } = new();
    public float PushHold01 => Mathf.Clamp01(pushHold / PushHoldSeconds);

    /// <summary>站在巨石前、面向巨石（推的範圍內）。</summary>
    public bool AtBoulder { get; private set; }

    public bool InputEnabled
    {
        get => inputEnabled;
        set
        {
            inputEnabled = value;
            if (body != null)
                body.InputEnabled = value;
            if (!value)
                pushHold = 0f;
        }
    }

    public event Action PushCompleted;
    public event Action EscapeRequested;

    public void Init(FirstPersonPlayer body, Boulder boulder, IReadOnlyList<StonePickup> pickups, Func<bool> boulderOpen)
    {
        this.body = body;
        this.boulder = boulder;
        this.pickups = pickups;
        this.boulderOpen = boulderOpen;
        controller = body.GetComponent<CharacterController>();
        InputEnabled = false;
        ResetForNight();
    }

    public void ResetForNight()
    {
        Stones = StartStones;
        Stamina.Reset();
        pushHold = 0f;
        stepTimer = 0f;
        lastPosition = transform.position;
    }

    void Update()
    {
        var keyboard = Keyboard.current;
        var mouse = Mouse.current;
        bool locked = Cursor.lockState == CursorLockMode.Locked;
        if (keyboard == null || mouse == null || body == null)
            return;
        if (!inputEnabled)
        {
            lastPosition = transform.position;
            wasLocked = locked;
            return;
        }

        // 站著不動按 Shift 不算跑，不耗體力。
        bool wantRun = (keyboard.leftShiftKey.isPressed || keyboard.rightShiftKey.isPressed)
            && Flat(controller.velocity).sqrMagnitude > 0.01f;
        bool running = Stamina.Tick(Time.deltaTime, wantRun);
        if (Stamina.PantDue(Time.deltaTime))
            SoundBus.Emit(SoundKind.Pant, body.CameraTransform.position);
        body.walkSpeed = running ? RunSpeed : CrouchSpeed;
        UpdateSteps(running);

        if (keyboard.qKey.wasPressedThisFrame)
            SoundBus.Emit(SoundKind.Clap, body.CameraTransform.position);

        // 這一幀才重新鎖住游標的那一下點擊不算丟石子。
        if (wasLocked && mouse.leftButton.wasPressedThisFrame && Stones > 0)
            Throw();

        UpdateBoulder(keyboard);
        UpdatePickups();
        wasLocked = locked;
    }

    void UpdateSteps(bool running)
    {
        Vector3 delta = transform.position - lastPosition;
        delta.y = 0f;
        lastPosition = transform.position;
        if (delta.sqrMagnitude < 1e-6f)
        {
            stepTimer = 0f;
            return;
        }
        stepTimer += Time.deltaTime;
        if (stepTimer >= (running ? RunStepSeconds : CrouchStepSeconds))
        {
            stepTimer = 0f;
            SoundBus.Emit(running ? SoundKind.Run : SoundKind.Step, transform.position);
        }
    }

    void Throw()
    {
        Stones--;
        Transform cam = body.CameraTransform;
        LooseStone.Spawn(cam.position + cam.forward * 0.5f, cam.forward * 9f + Vector3.up * 2f, controller);
    }

    void UpdateBoulder(Keyboard keyboard)
    {
        Vector3 forward = Flat(body.CameraTransform.forward).normalized;
        Vector3 toPush = Flat(boulder.PushPoint - transform.position);
        AtBoulder = toPush.magnitude <= PushReach && Vector3.Dot(forward, toPush.normalized) > PushFacingDot;

        if (boulderOpen())
        {
            pushHold = 0f;
            if (keyboard.eKey.wasPressedThisFrame && Flat(boulder.GapPoint - transform.position).magnitude <= PushReach)
                EscapeRequested?.Invoke();
            return;
        }

        if (AtBoulder && keyboard.eKey.isPressed)
        {
            pushHold += Time.deltaTime;
            if (pushHold >= PushHoldSeconds)
            {
                pushHold = 0f;
                PushCompleted?.Invoke();
            }
        }
        else
            pushHold = 0f;
    }

    void UpdatePickups()
    {
        if (Stones >= MaxStones)
            return;
        foreach (var p in pickups)
        {
            if (p.Taken || Flat(p.transform.position - transform.position).magnitude > PickupReach)
                continue;
            p.Take();
            Stones++;
            if (Stones >= MaxStones)
                return;
        }
        // 丟出去、停在地上的石子也撿得回來。
        foreach (var s in new List<LooseStone>(LooseStone.All))
        {
            if (s == null || !s.Settled || Flat(s.transform.position - transform.position).magnitude > PickupReach)
                continue;
            s.Take();
            Stones++;
            if (Stones >= MaxStones)
                return;
        }
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);
}
