from pathlib import Path
import unittest

from scripts.validate_graph import validate_project


class PublicGraphValidationTests(unittest.TestCase):
    def test_public_subset_validates(self):
        root = Path(__file__).resolve().parents[1]
        self.assertEqual(validate_project(root), [])


if __name__ == '__main__':
    unittest.main()
