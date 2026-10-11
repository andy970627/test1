using System;
using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;
using NVector2 = System.Numerics.Vector2;

/// <summary>
/// 洞裡所有同伴與跟在玩家後面的隊伍：跟隨者沿著玩家走過的路線排成一列（間隔 1 m），
/// 移動時跟玩家用同樣的步頻出聲；按 F 整隊蹲下不動、不出聲。
/// </summary>
public class CrewLine : MonoBehaviour
{
    // 跟隨者最快只比玩家快一點，跟得上隊伍但趕不上瞬移。
    const float CatchUpFactor = 1.2f;

    readonly List<CrewMember> members = new();
    readonly List<CrewMember> followers = new();
    readonly Dictionary<CrewMember, float> stepTimers = new();
    readonly Dictionary<CrewMember, Vector3> lastPositions = new();

    Transform player;
    Func<Vector3, float> stepScale;
    FollowTrail trail;
    bool crouching;

    public IReadOnlyList<CrewMember> Members => members;
    public IReadOnlyList<CrewMember> Followers => followers;
    public bool Crouching => crouching;

    /// <summary>玩家是否在跑（由 EchoPlayer 每幀設定），跟隨者照跑步步頻出聲。</summary>
    public bool Running { get; set; }

    public void Init(Transform player, Func<Vector3, float> stepScale)
    {
        this.player = player;
        this.stepScale = stepScale;
        trail = new FollowTrail(Flat(player.position));
    }

    /// <summary>清掉舊的同伴，在 spots 前 count 個位置產生新的躲藏同伴。</summary>
    public void Spawn(int count, IReadOnlyList<Vector3> spots, int seed)
    {
        foreach (var m in members)
            if (m != null)
                Destroy(m.gameObject);
        members.Clear();
        followers.Clear();
        stepTimers.Clear();
        lastPositions.Clear();
        crouching = false;
        trail.Reset(Flat(player.position));

        for (int i = 0; i < count && i < spots.Count; i++)
        {
            var m = new GameObject("Crew" + i).AddComponent<CrewMember>();
            m.transform.SetParent(transform, false);
            m.Init(spots[i], seed * 31 + i);
            members.Add(m);
        }
    }

    public CrewMember NearestHiding(Vector3 p, float reach)
    {
        CrewMember best = null;
        float bestDistance = reach;
        foreach (var m in members)
        {
            if (m.Current != CrewMember.Mode.Hiding)
                continue;
            float d = FlatV(m.transform.position - p).magnitude;
            if (d <= bestDistance)
            {
                best = m;
                bestDistance = d;
            }
        }
        return best;
    }

    public void Recruit(CrewMember m)
    {
        if (m == null || followers.Contains(m))
            return;
        if (crouching)
            m.Crouch();
        else
            m.Follow();
        followers.Add(m);
        stepTimers[m] = 0f;
        lastPositions[m] = m.transform.position;
    }

    public void ToggleCrouch()
    {
        crouching = !crouching;
        foreach (var m in followers)
        {
            if (crouching)
                m.Crouch();
            else
                m.Follow();
        }
    }

    public void Remove(CrewMember m)
    {
        if (m == null)
            return;
        members.Remove(m);
        followers.Remove(m);
        stepTimers.Remove(m);
        lastPositions.Remove(m);
        m.Kill();
    }

    /// <summary>給巨人大腦用的平面位置，順序與 Members 相同。</summary>
    public List<NVector2> Positions()
    {
        var list = new List<NVector2>(members.Count);
        foreach (var m in members)
            list.Add(new NVector2(m.transform.position.x, m.transform.position.z));
        return list;
    }

    void Update()
    {
        if (player == null)
            return;
        trail.Record(Flat(player.position));
        if (crouching)
            return;

        for (int i = 0; i < followers.Count; i++)
        {
            var m = followers[i];
            // 用走路（或跑步）的速度走到隊伍裡的位置：從蹲下起身、或剛加入時不會瞬間移過去。
            NVector2 p = trail.PositionAt(i);
            Vector3 goal = new(p.X, 0f, p.Y);
            float maxStep = (Running ? EchoPlayer.RunSpeed : EchoPlayer.CrouchSpeed) * CatchUpFactor * Time.deltaTime;
            Vector3 here = FlatV(m.transform.position);
            m.MoveTo(Vector3.MoveTowards(here, goal, maxStep));
            Vector3 delta = FlatV(m.transform.position - lastPositions[m]);
            lastPositions[m] = m.transform.position;
            if (delta.sqrMagnitude < 1e-6f)
            {
                stepTimers[m] = 0f;
                continue;
            }
            stepTimers[m] += Time.deltaTime;
            float interval = Running ? EchoPlayer.RunStepSeconds : EchoPlayer.CrouchStepSeconds;
            if (stepTimers[m] < interval)
                continue;
            stepTimers[m] = 0f;
            Vector3 at = m.transform.position;
            SoundBus.Emit(Running ? SoundKind.Run : SoundKind.Step, at, stepScale(at));
        }
    }

    static NVector2 Flat(Vector3 v) => new(v.x, v.z);
    static Vector3 FlatV(Vector3 v) => new(v.x, 0f, v.z);
}
