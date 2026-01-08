# Allied Recruitment Portal

Recruitment management system for Allied Pharmacies (200+ branches).

## Quick Start
```bash
# Install dependencies
pnpm install

# Deploy recruitment portal
cd apps/recruitment-portal
npm run build && firebase deploy --only hosting:recruitment

# Deploy booking page  
cd ../booking-page
npm run build && firebase deploy --only hosting:booking

# Deploy functions
cd ../../functions
npm run build && firebase deploy --only functions
```

## URLs

- **Admin Portal:** https://allied-recruitment.web.app
- **Booking Page:** https://allied-booking.web.app
- **Firebase Console:** https://console.firebase.google.com/project/recruitment-633bd
