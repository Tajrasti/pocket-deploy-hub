# Welcome to your Lovable project

## Project info

I have turned my oneplus 5t smartphone into a server with postmarketOS. I want a fully automated application that can host multiple different apps and dynamic websites which I will deploy from my github repositories, so it will be like a self-hosted Vercel. Don't use docker not padman for this project as they can't run on my limited kernel device, I will provide some extra info about my device below:

=== OS === 

Linux 6.0.0 #4-postmarketos-qcom-msm8998 SMP PREEMPT Sat Jun 7 18:56:49 UTC aarch64 Linux PRETTY_NAME="postmarketOS v25.06" NAME="postmarketOS" VERSION_ID="v25.06" VERSION="v25.06" ID="postmarketos" ID_LIKE="alpine" HOME_URL="https://www.postmarketos.org/" SUPPORT_URL="https://gitlab.postmarketos.org/postmarketOS" BUG_REPORT_URL="https://gitlab.postmarketos.org/postmarketOS/pmaports/issues" LOGO="postmarketos-logo" ANSI_COLOR="0;32"

=== CPU === 

Architecture: aarch64 CPU op-mode(s): 32-bit, 64-bit Byte Order: Little Endian CPU(s): 8 On-line CPU(s) list: 0-7 Vendor ID: Qualcomm Model name: Falkor-V1/Kryo Model: 1 Thread(s) per core: 1 Core(s) per socket: 4 Socket(s): 1 Stepping: 0xa CPU(s) scaling MHz: 100% CPU max MHz: 2361.6001 CPU min MHz: 300.0000 BogoMIPS: 38.40 Flags: fp asimd aes pmull sha1 sha2 crc32 cpuid Model name: Kryo-V2 Model: 4 Thread(s) per core: 1 Core(s) per socket: 4 Socket(s): 1 Stepping: 0xa CPU(s) scaling MHz: 100% CPU max MHz: 1900.8000 CPU min MHz: 300.0000 BogoMIPS: 38.40 Flags: fp asimd aes pmull sha1 sha2 crc32 cpuid Vulnerabilities:
Itlb multihit: Not affected L1tf: Not affected Mds: Not affected Meltdown: Not affected Mmio stale data: Not affected Retbleed: Not affected Spec store bypass: Vulnerable Spectre v1: Mitigation; __user pointer sanitization Spectre v2: Vulnerable Srbds: Not affected Tsx async abort: Not affected

=== MEMORY === 

total used free shared buff/cache available Mem: 7.5G 136.1M 7.1G 10.4M 207.5M 7.2G Swap: 0 0 0

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
