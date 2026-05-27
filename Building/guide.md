# 🚀 GitHub Branching Guide (For Collaborators)

This guide explains exactly how to work on this repository without breaking anything.

---

## 🔑 Prerequisites

* You have accepted the collaborator invite
* Git is installed on your system

---

## 📥 Step 1: Clone the Repository

```bash
git clone https://github.com/OWNER/REPO_NAME.git
cd REPO_NAME
```

---

## 🌿 Step 2: Always Start from Latest Main

```bash
git checkout main
git pull origin main
```

---

## 🌱 Step 3: Create a New Branch

```bash
git checkout -b feature/your-feature-name
```

### Example:

```bash
git checkout -b feature/login-system
```

---

## ✍️ Step 4: Make Your Changes

Edit files as needed.

---

## 💾 Step 5: Commit Your Changes

```bash
git add .
git commit -m "Describe what you changed"
```

---

## 🚀 Step 6: Push Your Branch

```bash
git push origin feature/your-feature-name
```

---

## 🔀 Step 7: Create a Pull Request (PR)

1. Go to the repository on GitHub
2. Click **Compare & pull request**
3. Add description of your work
4. Submit PR

---

## ⚠️ Rules (IMPORTANT)

* ❌ Do NOT push directly to `main`
* ❌ Do NOT work on `main`
* ✅ Always create a new branch
* ✅ Use meaningful branch names

---

## 🧠 Branch Naming Convention

* `feature/...` → new features
* `bugfix/...` → bug fixes
* `hotfix/...` → urgent fixes

### Examples:

* `feature/payment-integration`
* `bugfix/login-error`

---

## 🔄 Updating Your Branch (if main changes)

```bash
git checkout main
git pull origin main

git checkout feature/your-feature-name
git merge main
```

---

## 🆘 Common Errors

### 1. Permission denied

➡️ Make sure you accepted the invite

### 2. Branch not showing on GitHub

➡️ You forgot to push:

```bash
git push origin branch-name
```

---

## ✅ Summary Workflow

```bash
git clone <repo>
cd <repo>

git checkout main
git pull origin main

git checkout -b feature/new-work

# make changes

git add .
git commit -m "message"

git push origin feature/new-work
```

---

## 📌 Final Note

If you're unsure about anything, ask before pushing. It's easier to prevent issues than fix them later.
