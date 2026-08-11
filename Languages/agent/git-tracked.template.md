**This folder may be a git repository, and if it is, git commands are database writes.** The
   `.gitignore` that normally hides the mirror has been turned off deliberately
   (`cvucsedit.WriteMirrorGitignore`). The watcher cannot tell git apart from a save, so anything
   that rewrites a file in the working tree — `checkout`, `switch`, `merge`, `pull`, `stash pop`,
   `revert`, `reset --hard` — is pushed to the live database, one `UPDATE` per changed file. A merge
   that stops on a conflict writes its `<<<<<<<` markers into the file, and those get pushed too,
   leaving a standard Cabinet Vision cannot parse. Never check something out to "have a look at it".
   Reading history is safe and is what you should use instead: `git log`, `git show <rev>:<path>`
   and `git diff` touch no file in the working tree. Restoring an old version is a decision for the
   user, not a step you take on the way to something else.
