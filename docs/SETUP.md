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

`npm start` reads `.env` automatically (Node 20.12 or newer). Variables already set in
the environment, for example by a hosting service, win over the file.

### `NVIDIA_API_KEY` (or `ANTHROPIC_API_KEY`)
- **What it is:** lets the server ask NVIDIA Nemotron Ultra (or Claude) to write plans and stories.
- **Where to get an NVIDIA key:** build.nvidia.com > API Keys > Generate Key.
- **Where to get an Anthropic key:** console.anthropic.com > API Keys > Create Key.
- **Provider selection (`AI_PROVIDER`):** defaults to `auto` (uses `NVIDIA_API_KEY` if set, otherwise `ANTHROPIC_API_KEY`, otherwise runs the built-in offline story). Set `AI_PROVIDER=nvidia` or `AI_PROVIDER=anthropic` to choose explicitly.
- **Cost:** Anthropic is pay per use (roughly 5-6 US cents per story on the default model); NVIDIA NIM offers free developer credits on build.nvidia.com.
- **If you lose it:** create a new one in the same place and delete the old one.
- **Optional:** without either key the app runs the built-in offline story.

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
npm run eval -- --yes             # real run on the AI in .env: NVIDIA (credits, about 85
                                  # calls) or Claude (about $2.50, capped by --max-usd)
```

Add `--label=before --write-evidence` to save the summary in `docs/evidence/BL-009.md`.

## Moving between machines
Never email, message, or paste secrets into a chat window. Get fresh values from the
sources above on each machine. If a key has ever appeared in a chat transcript or a
screenshot, rotate it.
