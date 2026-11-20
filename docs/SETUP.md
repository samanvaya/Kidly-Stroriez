# Setup

Everything you need to run this on a new machine. You need Node.js 20 or newer.

## 1. Clone

```bash
git clone https://github.com/samanvaya/Kidly-Stroriez.git
cd Kidly-Stroriez
npm install
```

## 2. Secrets

Copy the example file. Never commit the real one, it is git-ignored for a reason.

```bash
cp .env.example .env
```

### `ANTHROPIC_API_KEY`
- **What it is:** lets the server ask Claude to write plans and stories.
- **Where to get it:** console.anthropic.com > API Keys > Create Key.
- **Cost:** pay per use; roughly 5-6 US cents per story on the default model.
- **If you lose it:** create a new one in the same place and delete the old one.
- **Optional:** without it the app runs the built-in offline story.

On a hosting service (Render, Railway, ...) put it in the service's environment
variables, never in the code.

## 3. Run and check

```bash
npm start            # http://localhost:3000
./scripts/verify.sh  # lint and tests
```

## 4. Safety eval (optional, costs money)

```bash
npm run eval                      # shows the cases and the estimated cost, sends nothing
npm run eval -- --dry-run         # tests the eval itself with a stand-in AI, free
npm run eval -- --yes             # real run with ANTHROPIC_API_KEY from .env (about $2.50)
```

Add `--label=before --write-evidence` to save the summary in `docs/evidence/BL-009.md`.

## Moving between machines
Never email, message, or paste secrets into a chat window. Get fresh values from the
sources above on each machine. If a key has ever appeared in a chat transcript or a
screenshot, rotate it.
