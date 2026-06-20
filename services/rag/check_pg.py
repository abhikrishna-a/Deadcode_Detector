import asyncio, asyncpg
async def go():
    conn = await asyncpg.connect('postgresql://postgres:1234@localhost:5432/deadcode_detector')
    rows = await conn.fetch("SELECT pid, query, state, wait_event FROM pg_stat_activity WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%'")
    for r in rows:
        print(f'PID={r["pid"]} state={r["state"]} wait={r["wait_event"]} query={r["query"][:100]}')
    await conn.close()
asyncio.run(go())
