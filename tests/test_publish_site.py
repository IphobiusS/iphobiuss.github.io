"""Exercise publication against a local bare remote, without GitHub or credentials."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/publish-site.py'
SPEC = importlib.util.spec_from_file_location('publisher', SCRIPT)
PUBLISH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PUBLISH)


def git_at(path, *args):
    return subprocess.check_output(['git', *args], cwd=path, text=True,
                                   stderr=subprocess.DEVNULL).strip()


class Publication(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='site-publisher-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.remote = self.root / 'remote.git'
        git_at(self.root, 'init', '--bare', '--initial-branch=main', str(self.remote))
        self.source = self.root / 'source'
        git_at(self.root, 'clone', str(self.remote), str(self.source))
        git_at(self.source, 'config', 'user.name', 'Local fixture')
        git_at(self.source, 'config', 'user.email', 'fixture@example.invalid')
        (self.source / 'obsolete.html').write_text('old page')
        git_at(self.source, 'add', '.')
        git_at(self.source, 'commit', '-m', 'Original publication')
        git_at(self.source, 'push', 'origin', 'main')
        git_at(self.source, 'checkout', '-b', 'source')
        (self.source / 'README.md').write_text('source documentation')
        git_at(self.source, 'add', '.')
        git_at(self.source, 'commit', '-m', 'Editable sources')
        git_at(self.source, 'push', 'origin', 'source')
        self.sha = git_at(self.source, 'rev-parse', 'HEAD')
        (self.source / 'dist/assets').mkdir(parents=True)
        (self.source / 'dist/index.html').write_text('<h1>Current site</h1>')
        (self.source / 'dist/.nojekyll').write_text('')
        (self.source / 'dist/assets/current.js').write_text('/* current */')
        old_root, old_git = PUBLISH.ROOT, PUBLISH.git
        PUBLISH.ROOT = self.source
        # The production helper binds its cwd at definition time; direct local calls.
        PUBLISH.git = lambda *args, cwd=None: git_at(cwd or self.source, *args)
        self.addCleanup(setattr, PUBLISH, 'ROOT', old_root)
        self.addCleanup(setattr, PUBLISH, 'git', old_git)

    def test_only_dist_is_published_and_repetition_creates_no_commit(self):
        before = git_at(self.remote, 'rev-parse', 'main')
        commit = PUBLISH.publish_tree(self.sha)
        self.assertEqual(git_at(self.remote, 'rev-parse', 'main'), commit)
        self.assertEqual(git_at(self.remote, 'rev-parse', commit + '^'), before)
        files = set(git_at(self.remote, 'ls-tree', '-r', '--name-only', commit).splitlines())
        self.assertEqual(files, {'.nojekyll', 'index.html', 'assets/current.js'})
        self.assertEqual(PUBLISH.publish_tree(self.sha), commit)
        self.assertEqual(git_at(self.remote, 'rev-parse', 'source'), self.sha)

    def test_superseded_source_does_not_publish(self):
        original_main = git_at(self.remote, 'rev-parse', 'main')
        git_at(self.source, 'commit', '--allow-empty', '-m', 'Newer source')
        git_at(self.source, 'push', 'origin', 'source')
        self.assertIsNone(PUBLISH.publish_tree(self.sha))
        self.assertEqual(git_at(self.remote, 'rev-parse', 'main'), original_main)

    def test_concurrent_main_change_is_not_overwritten(self):
        base_git = PUBLISH.git
        other = self.root / 'other'
        git_at(self.root, 'clone', str(self.remote), str(other))
        git_at(other, 'config', 'user.name', 'Local fixture')
        git_at(other, 'config', 'user.email', 'fixture@example.invalid')
        (other / 'concurrent.html').write_text('must survive')
        git_at(other, 'add', '.')
        git_at(other, 'commit', '-m', 'Concurrent publication')
        expected = git_at(other, 'rev-parse', 'HEAD')

        def racing_git(*args, cwd=None):
            if args[:3] == ('push', 'origin', 'HEAD:refs/heads/main'):
                git_at(other, 'push', 'origin', 'main')
            return base_git(*args, cwd=cwd)

        PUBLISH.git = racing_git
        with self.assertRaises(subprocess.CalledProcessError):
            PUBLISH.publish_tree(self.sha)
        self.assertEqual(git_at(self.remote, 'rev-parse', 'main'), expected)

    def test_source_advanced_during_preparation_does_not_publish(self):
        original_main = git_at(self.remote, 'rev-parse', 'main')
        base_git = PUBLISH.git
        advanced = []

        def racing_git(*args, cwd=None):
            result = base_git(*args, cwd=cwd)
            if 'commit' in args and cwd is not None and Path(cwd).name == 'main':
                git_at(self.source, 'commit', '--allow-empty', '-m', 'New source during preparation')
                git_at(self.source, 'push', 'origin', 'source')
                advanced.append(git_at(self.source, 'rev-parse', 'HEAD'))
            return result

        PUBLISH.git = racing_git
        self.assertIsNone(PUBLISH.publish_tree(self.sha))
        self.assertEqual(len(advanced), 1)
        self.assertEqual(git_at(self.remote, 'rev-parse', 'source'), advanced[0])
        self.assertEqual(git_at(self.remote, 'rev-parse', 'main'), original_main)
        # Even the skipped detached commit must not leave an extra worktree.
        self.assertEqual(git_at(self.source, 'worktree', 'list', '--porcelain').count('worktree '), 1)


if __name__ == '__main__':
    unittest.main()
