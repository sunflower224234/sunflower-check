"""签到系统 —— 数据访问层。

设计说明：
    * 只使用 Python 标准库 ``sqlite3``，全项目零第三方依赖；
    * 「同一学号同一天只能签到一次」由数据库唯一索引兜底，
      这样即使多人同时提交，也不会产生重复记录。
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime

# 数据库文件位置。可通过环境变量 CHECKIN_DB 覆盖，方便测试与部署。
DB_PATH = os.environ.get(
    "CHECKIN_DB",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "checkin.db"),
)

# 晚于该时刻签到，记为「迟到」
LATE_AFTER = "08:30:00"

# 学号允许的位数范围
STUDENT_ID_MIN_LEN = 4
STUDENT_ID_MAX_LEN = 20

SCHEMA = """
CREATE TABLE IF NOT EXISTS checkin (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    checkin_at  TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT '正常'
);

-- 同一学号 + 同一天 只允许一条记录（表达式索引）
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_per_day
    ON checkin (student_id, substr(checkin_at, 1, 10));
"""


@contextmanager
def connect():
    """打开数据库连接：正常结束时提交，任何情况下都关闭连接。"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """建表 + 建索引，可重复执行。"""
    with connect() as conn:
        conn.executescript(SCHEMA)


def _status_of(moment: datetime) -> str:
    """根据签到时刻判断出勤状态。"""
    return "迟到" if moment.strftime("%H:%M:%S") > LATE_AFTER else "正常"


def check_in(student_id: str, name: str, moment: datetime | None = None) -> dict:
    """登记一次签到。

    返回 ``{"ok": True, ...}`` 表示成功；
    返回 ``{"ok": False, "reason": "..."}`` 表示被拒绝（参数非法 or 重复签到）。
    """
    student_id = (student_id or "").strip()
    name = (name or "").strip()

    if not student_id or not name:
        return {"ok": False, "reason": "学号和姓名都不能为空"}
    # 必须同时校验 isascii：str.isdigit() 对全角数字「１」和上标「²」也返回 True
    if not (student_id.isascii() and student_id.isdigit()):
        return {"ok": False, "reason": "学号只能由 0-9 组成"}
    if not STUDENT_ID_MIN_LEN <= len(student_id) <= STUDENT_ID_MAX_LEN:
        return {
            "ok": False,
            "reason": f"学号长度应为 {STUDENT_ID_MIN_LEN}-{STUDENT_ID_MAX_LEN} 位",
        }

    moment = moment or datetime.now()
    timestamp = moment.strftime("%Y-%m-%d %H:%M:%S")
    status = _status_of(moment)

    try:
        with connect() as conn:
            cursor = conn.execute(
                "INSERT INTO checkin (student_id, name, checkin_at, status) "
                "VALUES (?, ?, ?, ?)",
                (student_id, name, timestamp, status),
            )
            record_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        # 唯一索引冲突 = 该学号今天已经签过
        return {"ok": False, "reason": "该学号今日已签到"}

    return {
        "ok": True,
        "id": record_id,
        "student_id": student_id,
        "name": name,
        "checkin_at": timestamp,
        "status": status,
    }


def list_records(limit: int = 100) -> list[dict]:
    """按签到时间倒序返回签到记录。"""
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, student_id, name, checkin_at, status FROM checkin "
            "ORDER BY checkin_at DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def all_records() -> list[dict]:
    """按签到时间正序返回全部记录，供导出使用。"""
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, student_id, name, checkin_at, status FROM checkin "
            "ORDER BY checkin_at ASC, id ASC"
        ).fetchall()
    return [dict(row) for row in rows]


def stats(today: str | None = None) -> dict:
    """返回指定日期（默认今天）的签到统计。"""
    today = today or datetime.now().strftime("%Y-%m-%d")
    with connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS total, "
            "       SUM(CASE WHEN status = '迟到' THEN 1 ELSE 0 END) AS late "
            "FROM checkin WHERE substr(checkin_at, 1, 10) = ?",
            (today,),
        ).fetchone()

    total = row["total"] or 0
    late = row["late"] or 0
    return {"date": today, "total": total, "late": late, "ontime": total - late}
