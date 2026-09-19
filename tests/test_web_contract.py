from pathlib import Path
import unittest


class PublicWebContractTests(unittest.TestCase):
    def test_required_web_files_exist(self):
        root = Path(__file__).resolve().parents[1]
        for relative_path in [
            'web/index.html', 'web/app.js', 'web/graph-model.js',
            'web/query-model.js', 'web/router.js', 'web/styles.css',
        ]:
            self.assertTrue((root / relative_path).is_file(), relative_path)


if __name__ == '__main__':
    unittest.main()
