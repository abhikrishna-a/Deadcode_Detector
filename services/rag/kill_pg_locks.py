import asyncio, asyncpg
async def go():
    conn = await asyncpg.connect('postgresql://postgres:1234@localhost:5432/deadcode_detector')
    # Find all blocking PIDs
    rows = await conn.fetch("SELECT pid, pg_blocking_pids(pid) as blocked_by FROM pg_stat_activity WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%' AND query NOT LIKE '%pg_blocking_pids%'")
    for r in rows:
        pid = r["pid"]
        blocked_by = r["blocked_by"]
        print(f"PID={pid} blocked_by={blocked_by}")
        # Kill non-backend processes
        if blocked_by:
            for bp in blocked_by:
                print(f"  Killing blocker PID={bp}")
                await conn.execute(f"SELECT pg_terminate_backend({bp})")
            print(f"  Killing blocked PID={pid}")
            await conn.execute(f"SELECT pg_terminate_backend({pid})")
    # Kill remaining ALTER TABLE processes (those not blocked but blocking others)
    rows2 = await conn.fetch("SELECT pid FROM pg_stat_activity WHERE query LIKE 'ALTER TABLE%'")
    for r in rows2:
        print(f"Killing leftover ALTER TABLE PID={r['pid']}")
        await conn.execute(f"SELECT pg_terminate_backend({r['pid']})")
    await conn.close()
    print("Done - all blocking queries terminated")
asyncio.run(go())
