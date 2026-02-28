# GitHub Repo Setup

This project is ready to be pushed to a new GitHub repository.

## 1) Initialize local repository
Run from project root (`lumit`):

```bash
git init
git branch -M main
git add .
git commit -m "Initial Lumit app, extension, and website"
```

## 2) Create remote repo
Create an empty repository on GitHub web UI (do not add README/license/gitignore there).

Example URL:

```text
https://github.com/<your-user-or-org>/lumit.git
```

## 3) Connect and push

```bash
git remote add origin https://github.com/<your-user-or-org>/lumit.git
git push -u origin main
```

## 4) Turn on GitHub Pages
1. Open repository Settings.
2. Open Pages.
3. Set Build and deployment Source to `GitHub Actions`.
4. Push any change under `website/` to trigger deploy.

## 5) Use the Pages URL
GitHub Pages URL will look like:

```text
https://<your-user-or-org>.github.io/lumit/
```

Use this URL for:
- VS Code Marketplace publisher `Company website`
- `homepage` field in `vscode-extension/package.json`
