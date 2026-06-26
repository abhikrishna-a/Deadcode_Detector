import django; django.setup()
from django.db import connection

# Test the debug_sql internals
import inspect
from django.db.backends.utils import CursorDebugWrapper
print('=== CursorDebugWrapper.debug_sql ===')
print(inspect.getsource(CursorDebugWrapper.debug_sql))
