/**
 * Pesapal Configuration Helper
 * Returns country-specific Pesapal credentials based on country code
 */

const PESAPAL_CREDENTIALS = {
  KE: { // Kenya
    consumer_key: 'qkio1BGGYAXTu2JOfm7XSXNruoZsrqEW',
    consumer_secret: 'osGQ364R49cXKeOYSpaOnT++rHs=',
    currency: 'KES',
    countryCode: 'KE'
  },
  UG: { // Uganda
    consumer_key: 'TDpigBOOhs+zAl8cwH2Fl82jJGyD8xev',
    consumer_secret: '1KpqkfsMaihIcOlhnBo/gBZ5smw=',
    currency: 'UGX',
    countryCode: 'UG'
  },
  TZ: { // Tanzania
    consumer_key: 'ngW+UEcnDhltUc5fxPfrCD987xMh3Lx8',
    consumer_secret: 'q27RChYs5UkypdcNYKzuUw460Dg=',
    currency: 'TZS',
    countryCode: 'TZ'
  },
  MW: { // Malawi
    consumer_key: 'htMsEFfIVHfhqBL9O0ykz8wuedfFyg1s',
    consumer_secret: 'DcwkVNIiyijNWn1fdL/pa4K6khc=',
    currency: 'MWK',
    countryCode: 'MW'
  },
  RW: { // Rwanda
    consumer_key: 'wCGzX1fNzvtI5lMR5M4AxvxBmLpFgZzp',
    consumer_secret: 'uU7R9g2IHn9dkrKDVIfcPppktIo=',
    currency: 'RWF',
    countryCode: 'RW'
  },
  ZM: { // Zambia
    consumer_key: 'v988cq7bMB6AjktYo/drFpe6k2r/y7z3',
    consumer_secret: '3p0F/KcY8WAi36LntpPf/Ss0MhQ=',
    currency: 'ZMW',
    countryCode: 'ZM'
  },
  ZW: { // Zimbabwe
    consumer_key: 'vknEWEEFeygxAX+C9TPOhvkbkPsj8qXK',
    consumer_secret: 'MOOP31smKijvusQbNXn/s7m8jC8=',
    currency: 'USD', // Zimbabwe uses USD
    countryCode: 'ZW'
  }
};

/**
 * Get Pesapal credentials for a specific country
 * @param {string} countryCode - Two-letter country code (KE, UG, TZ, etc.)
 * @returns {object} Pesapal credentials object
 */
function getPesapalCredentials(countryCode) {
  // Normalize country code to uppercase
  const normalizedCode = (countryCode || '').toUpperCase().trim();
  
  // Return credentials for the country, or default to Kenya if not found
  const credentials = PESAPAL_CREDENTIALS[normalizedCode] || PESAPAL_CREDENTIALS['KE'];
  
  return {
    consumer_key: credentials.consumer_key,
    consumer_secret: credentials.consumer_secret,
    currency: credentials.currency,
    countryCode: credentials.countryCode
  };
}

/**
 * Get Pesapal base URL (supports sandbox and production)
 * According to Pesapal API 3.0 documentation:
 * - Sandbox: https://cybqa.pesapal.com/pesapalv3
 * - Live: https://pay.pesapal.com/v3
 * @returns {string} Pesapal API base URL
 */
function getPesapalBaseUrl() {
  // If PESAPAL_URL is explicitly set, use it (but ensure it has the correct path)
  if (process.env.PESAPAL_URL) {
    let url = process.env.PESAPAL_URL.trim();
    // If URL doesn't end with /pesapalv3 or /v3, check if it's sandbox or production
    if (!url.includes('/pesapalv3') && !url.includes('/v3')) {
      const env = (process.env.PESAPAL_ENVIRONMENT || '').toLowerCase();
      if (env === 'sandbox') {
        url = url.endsWith('/') ? url + 'pesapalv3' : url + '/pesapalv3';
      } else {
        url = url.endsWith('/') ? url + 'v3' : url + '/v3';
      }
    }
    return url;
  }
  
  // Check environment (sandbox or production)
  const environment = (process.env.PESAPAL_ENVIRONMENT || '').toLowerCase();
  
  if (environment === 'sandbox') {
    return "https://cybqa.pesapal.com/pesapalv3";
  }
  
  // Default to production
  return "https://pay.pesapal.com/v3";
}

/**
 * Register IPN URL and get IPN ID
 * @param {string} ipnUrl - The IPN callback URL
 * @param {string} countryCode - Country code for credentials
 * @returns {Promise<string>} IPN ID
 */
async function registerIPN(ipnUrl, countryCode = 'KE') {
  const axios = require('axios');
  const pesapalConfig = getPesapalCredentials(countryCode);
  const pesapalBaseUrl = getPesapalBaseUrl();
  
  try {
    // Get authentication token
    const authRes = await axios.post(
      `${pesapalBaseUrl}/api/Auth/RequestToken`,
      {
        consumer_key: pesapalConfig.consumer_key,
        consumer_secret: pesapalConfig.consumer_secret
      }
    );

    const token = authRes?.data?.token;
    if (!token) {
      throw new Error('Failed to get authentication token');
    }

    // Register IPN URL
    // According to Pesapal API 3.0 docs, Accept header is required
    const registerRes = await axios.post(
      `${pesapalBaseUrl}/api/URLSetup/RegisterIPN`,
      {
        url: ipnUrl,
        ipn_notification_type: 'GET' // or 'POST'
      },
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      }
    );

    // Pesapal API might return ipn_id or ipnId
    // Pesapal API returns ipn_id in the response (according to API 3.0 docs)
    console.log('IPN Registration Response:', JSON.stringify(registerRes?.data, null, 2));
    
    const ipnId = registerRes?.data?.ipn_id;
    
    if (!ipnId) {
      // Log full response for debugging
      console.error('IPN Registration Response:', JSON.stringify(registerRes?.data, null, 2));
      throw new Error('Failed to get IPN ID from registration response. Response: ' + JSON.stringify(registerRes?.data));
    }

    // Validate it's a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(ipnId)) {
      throw new Error(`Invalid IPN ID format received: ${ipnId}`);
    }

    console.log(`Successfully registered IPN. IPN ID: ${ipnId}`);
    return ipnId;
  } catch (error) {
    console.error('Error registering IPN:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get list of registered IPNs
 * @param {string} countryCode - Country code for credentials
 * @returns {Promise<Array>} List of IPNs
 */
async function getIPNList(countryCode = 'KE') {
  const axios = require('axios');
  const pesapalConfig = getPesapalCredentials(countryCode);
  const pesapalBaseUrl = getPesapalBaseUrl();
  
  try {
    // Get authentication token
    const authRes = await axios.post(
      `${pesapalBaseUrl}/api/Auth/RequestToken`,
      {
        consumer_key: pesapalConfig.consumer_key,
        consumer_secret: pesapalConfig.consumer_secret
      }
    );

    const token = authRes?.data?.token;
    if (!token) {
      throw new Error('Failed to get authentication token');
    }

      // Get IPN list
      const listRes = await axios.get(
        `${pesapalBaseUrl}/api/URLSetup/GetIpnList`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );

      // Pesapal might return array directly or wrapped in data property
      const ipnList = Array.isArray(listRes?.data) ? listRes.data : (listRes?.data?.ipns || listRes?.data?.data || []);
      return ipnList;
  } catch (error) {
    console.error('Error getting IPN list:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  getPesapalCredentials,
  getPesapalBaseUrl,
  registerIPN,
  getIPNList,
  PESAPAL_CREDENTIALS
};

