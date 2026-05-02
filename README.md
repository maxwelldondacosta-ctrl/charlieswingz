# Charlie's Wingz — Ordering System

Premium chicken wings ordering system with integrated Square payments.

## Features

- Full menu with wings, meals, bundles, and sides
- Sauce and drink selection
- Cart management
- Square Web Payments SDK integration (PCI compliant)
- Collection orders (delivery architecture ready but disabled)
- Order confirmation with receipts
- Responsive design

## Setup

### 1. Prerequisites

- Node.js 18+ installed
- Square Developer account with application created

### 2. Installation

```bash
# Install dependencies
npm install
```

### 3. Configuration

Edit the `.env` file with your Square credentials:

```env
SQUARE_APPLICATION_ID=sandbox-sq0idb-xxxxx  # Your app ID
SQUARE_ACCESS_TOKEN=EAAAl-xxxxx             # Your access token
SQUARE_LOCATION_ID=LXXXXXXXXX               # Your location ID
SQUARE_ENVIRONMENT=sandbox                   # sandbox or production
```

### 4. Run Locally

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Visit `http://localhost:3000`

## Deployment to Unlimited Web Hosting

### 1. Upload Files

Upload all files via SFTP or cPanel File Manager to your hosting directory.

### 2. Set Up Node.js App

In cPanel:
1. Go to **Node.js Selector** (under Software)
2. Click **Create Application**
3. Settings:
   - Node.js version: 18.x or higher
   - Application mode: Production
   - Application root: Your app folder path
   - Application URL: Your domain
   - Application startup file: `server.js`
4. Click **Create**

### 3. Install Dependencies

In the Node.js application page:
1. Click **Run NPM Install**

Or via SSH:
```bash
cd /path/to/your/app
npm install --production
```

### 4. Environment Variables

In cPanel Node.js Selector:
1. Click on your application
2. Scroll to **Environment Variables**
3. Add each variable from your `.env` file

### 5. Restart Application

Click **Restart** in the Node.js Selector.

## Going Live (Production)

When ready to go live:

1. Get **Production credentials** from Square Developer Dashboard
2. Update `.env`:
   ```env
   SQUARE_APPLICATION_ID=sq0idp-xxxxx     # Production app ID (no 'sandbox-' prefix)
   SQUARE_ACCESS_TOKEN=EAAAl-xxxxx        # Production access token
   SQUARE_ENVIRONMENT=production
   ```
3. Update the Square SDK URL in `public/index.html`:
   ```html
   <!-- Change from sandbox to production -->
   <script src="https://web.squarecdn.com/v1/square.js"></script>
   ```
4. Restart the application

## Enabling Delivery

When ready to offer delivery:

1. Edit `server.js`
2. Change `DELIVERY_ENABLED = false` to `DELIVERY_ENABLED = true`
3. Restart the server

## File Structure

```
charlies-wingz/
├── server.js           # Node.js backend
├── package.json        # Dependencies
├── .env                # Configuration (don't commit!)
├── .env.example        # Config template
├── .gitignore
├── README.md
└── public/
    ├── index.html      # Frontend
    └── logo.png        # Logo
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get Square app config |
| `/api/menu` | GET | Get menu data |
| `/api/cart/validate` | POST | Validate cart items |
| `/api/payment` | POST | Process payment |
| `/api/health` | GET | Health check |

## Testing with Sandbox

Use these test card numbers in sandbox mode:

| Card | Number |
|------|--------|
| Visa | 4532 0001 3020 1001 |
| Mastercard | 5200 0000 0000 1096 |
| Declined | 4000 0000 0000 0002 |

Any future expiry date and any CVV will work.

## Support

For issues with:
- **Square payments**: [Square Developer Docs](https://developer.squareup.com/docs)
- **Hosting**: Contact Unlimited Web Hosting support
