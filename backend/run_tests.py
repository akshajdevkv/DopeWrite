"""Run tests without depending on the developer's live Supabase account."""
import os
import sys
import unittest
from unittest.mock import patch

if __name__ == '__main__':
    names = ('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY')
    # Auth tests explicitly supply their own mocked project within this scope.
    with patch.dict(os.environ, dict.fromkeys(names, '')):
        suite = unittest.defaultTestLoader.discover('backend', pattern='test_*.py')
        result = unittest.TextTestRunner(verbosity=1).run(suite)
    sys.exit(not result.wasSuccessful())
