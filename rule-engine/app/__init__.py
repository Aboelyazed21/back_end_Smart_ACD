"""Smart Academic Advisor rule engine (AIDM / BUA 2023 bylaws).

The engine is pure and state-free: every request carries the student's
record, the term, and the available offerings. The backend API is the only
client and is responsible for persistence, audit logging and escalation
creation. The engine never registers a course and every plan it returns is a
DRAFT.
"""

__version__ = "1.0.0"
ENGINE_VERSION = "1.0.0"
