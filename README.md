# Manufacturing CRM Quote Widget

This v1 Zoho CRM popup widget is designed for a custom button on the `Deals` module. It loads the current Deal, fetches existing CRM `Products`, lets a user edit quantity and rate, and creates a CRM `Quote` using the Deal's `Account_Name`, `Contact_Name`, and selected `Quoted_Items`.

## Setup

1. Install dependencies once with `npm install`.
2. Start the app server with `npm start` only if your deployment flow needs a Node host for static serving.
3. Package or deploy the widget resources to the hosting setup used by your Zoho CRM extension.

## Deployment notes

- Configure the widget as a popup launched from the `Deals` module.
- The implementation assumes standard Zoho CRM field API names: `Deal_Name`, `Account_Name`, `Contact_Name`, `Quoted_Items`, `Product_Name`, `Quantity`, and `List_Price`.
- If your org uses different API names, update the constants in [app/js/domain.js](c:/Zoho/Widgets/Manufacturing/manufacturingestimate/app/js/domain.js:1).
- v1 intentionally does not create Products, generate PDFs, or perform post-create writeback beyond Quote creation.
