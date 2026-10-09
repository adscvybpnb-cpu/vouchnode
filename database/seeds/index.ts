import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../apps/backend/.env') });

const prisma = new PrismaClient();

const COUNTRIES: [string, string, string, string][] = [
  ['AF','Afghanistan','+93','🇦🇫'],['AL','Albania','+355','🇦🇱'],['DZ','Algeria','+213','🇩🇿'],
  ['AD','Andorra','+376','🇦🇩'],['AO','Angola','+244','🇦🇴'],['AG','Antigua and Barbuda','+1','🇦🇬'],
  ['AR','Argentina','+54','🇦🇷'],['AM','Armenia','+374','🇦🇲'],['AU','Australia','+61','🇦🇺'],
  ['AT','Austria','+43','🇦🇹'],['AZ','Azerbaijan','+994','🇦🇿'],['BS','Bahamas','+1','🇧🇸'],
  ['BH','Bahrain','+973','🇧🇭'],['BD','Bangladesh','+880','🇧🇩'],['BB','Barbados','+1','🇧🇧'],
  ['BY','Belarus','+375','🇧🇾'],['BE','Belgium','+32','🇧🇪'],['BZ','Belize','+501','🇧🇿'],
  ['BJ','Benin','+229','🇧🇯'],['BT','Bhutan','+975','🇧🇹'],['BO','Bolivia','+591','🇧🇴'],
  ['BA','Bosnia and Herzegovina','+387','🇧🇦'],['BW','Botswana','+267','🇧🇼'],['BR','Brazil','+55','🇧🇷'],
  ['BN','Brunei','+673','🇧🇳'],['BG','Bulgaria','+359','🇧🇬'],['BF','Burkina Faso','+226','🇧🇫'],
  ['BI','Burundi','+257','🇧🇮'],['CV','Cabo Verde','+238','🇨🇻'],['KH','Cambodia','+855','🇰🇭'],
  ['CM','Cameroon','+237','🇨🇲'],['CA','Canada','+1','🇨🇦'],['CF','Central African Republic','+236','🇨🇫'],
  ['TD','Chad','+235','🇹🇩'],['CL','Chile','+56','🇨🇱'],['CN','China','+86','🇨🇳'],
  ['CO','Colombia','+57','🇨🇴'],['KM','Comoros','+269','🇰🇲'],['CG','Congo','+242','🇨🇬'],
  ['CR','Costa Rica','+506','🇨🇷'],['HR','Croatia','+385','🇭🇷'],['CU','Cuba','+53','🇨🇺'],
  ['CY','Cyprus','+357','🇨🇾'],['CZ','Czech Republic','+420','🇨🇿'],['DK','Denmark','+45','🇩🇰'],
  ['DJ','Djibouti','+253','🇩🇯'],['DM','Dominica','+1','🇩🇲'],['DO','Dominican Republic','+1','🇩🇴'],
  ['EC','Ecuador','+593','🇪🇨'],['EG','Egypt','+20','🇪🇬'],['SV','El Salvador','+503','🇸🇻'],
  ['GQ','Equatorial Guinea','+240','🇬🇶'],['ER','Eritrea','+291','🇪🇷'],['EE','Estonia','+372','🇪🇪'],
  ['SZ','Eswatini','+268','🇸🇿'],['ET','Ethiopia','+251','🇪🇹'],['FJ','Fiji','+679','🇫🇯'],
  ['FI','Finland','+358','🇫🇮'],['FR','France','+33','🇫🇷'],['GA','Gabon','+241','🇬🇦'],
  ['GM','Gambia','+220','🇬🇲'],['GE','Georgia','+995','🇬🇪'],['DE','Germany','+49','🇩🇪'],
  ['GH','Ghana','+233','🇬🇭'],['GR','Greece','+30','🇬🇷'],['GD','Grenada','+1','🇬🇩'],
  ['GT','Guatemala','+502','🇬🇹'],['GN','Guinea','+224','🇬🇳'],['GW','Guinea-Bissau','+245','🇬🇼'],
  ['GY','Guyana','+592','🇬🇾'],['HT','Haiti','+509','🇭🇹'],['HN','Honduras','+504','🇭🇳'],
  ['HU','Hungary','+36','🇭🇺'],['IS','Iceland','+354','🇮🇸'],['IN','India','+91','🇮🇳'],
  ['ID','Indonesia','+62','🇮🇩'],['IR','Iran','+98','🇮🇷'],['IQ','Iraq','+964','🇮🇶'],
  ['IE','Ireland','+353','🇮🇪'],['IL','Israel','+972','🇮🇱'],['IT','Italy','+39','🇮🇹'],
  ['JM','Jamaica','+1','🇯🇲'],['JP','Japan','+81','🇯🇵'],['JO','Jordan','+962','🇯🇴'],
  ['KZ','Kazakhstan','+7','🇰🇿'],['KE','Kenya','+254','🇰🇪'],['KI','Kiribati','+686','🇰🇮'],
  ['KW','Kuwait','+965','🇰🇼'],['KG','Kyrgyzstan','+996','🇰🇬'],['LA','Laos','+856','🇱🇦'],
  ['LV','Latvia','+371','🇱🇻'],['LB','Lebanon','+961','🇱🇧'],['LS','Lesotho','+266','🇱🇸'],
  ['LR','Liberia','+231','🇱🇷'],['LY','Libya','+218','🇱🇾'],['LI','Liechtenstein','+423','🇱🇮'],
  ['LT','Lithuania','+370','🇱🇹'],['LU','Luxembourg','+352','🇱🇺'],['MG','Madagascar','+261','🇲🇬'],
  ['MW','Malawi','+265','🇲🇼'],['MY','Malaysia','+60','🇲🇾'],['MV','Maldives','+960','🇲🇻'],
  ['ML','Mali','+223','🇲🇱'],['MT','Malta','+356','🇲🇹'],['MH','Marshall Islands','+692','🇲🇭'],
  ['MR','Mauritania','+222','🇲🇷'],['MU','Mauritius','+230','🇲🇺'],['MX','Mexico','+52','🇲🇽'],
  ['FM','Micronesia','+691','🇫🇲'],['MD','Moldova','+373','🇲🇩'],['MC','Monaco','+377','🇲🇨'],
  ['MN','Mongolia','+976','🇲🇳'],['ME','Montenegro','+382','🇲🇪'],['MA','Morocco','+212','🇲🇦'],
  ['MZ','Mozambique','+258','🇲🇿'],['MM','Myanmar','+95','🇲🇲'],['NA','Namibia','+264','🇳🇦'],
  ['NR','Nauru','+674','🇳🇷'],['NP','Nepal','+977','🇳🇵'],['NL','Netherlands','+31','🇳🇱'],
  ['NZ','New Zealand','+64','🇳🇿'],['NI','Nicaragua','+505','🇳🇮'],['NE','Niger','+227','🇳🇪'],
  ['NG','Nigeria','+234','🇳🇬'],['NO','Norway','+47','🇳🇴'],['OM','Oman','+968','🇴🇲'],
  ['PK','Pakistan','+92','🇵🇰'],['PW','Palau','+680','🇵🇼'],['PA','Panama','+507','🇵🇦'],
  ['PG','Papua New Guinea','+675','🇵🇬'],['PY','Paraguay','+595','🇵🇾'],['PE','Peru','+51','🇵🇪'],
  ['PH','Philippines','+63','🇵🇭'],['PL','Poland','+48','🇵🇱'],['PT','Portugal','+351','🇵🇹'],
  ['QA','Qatar','+974','🇶🇦'],['RO','Romania','+40','🇷🇴'],['RU','Russia','+7','🇷🇺'],
  ['RW','Rwanda','+250','🇷🇼'],['KN','Saint Kitts and Nevis','+1','🇰🇳'],['LC','Saint Lucia','+1','🇱🇨'],
  ['VC','Saint Vincent and the Grenadines','+1','🇻🇨'],['WS','Samoa','+685','🇼🇸'],
  ['SM','San Marino','+378','🇸🇲'],['ST','Sao Tome and Principe','+239','🇸🇹'],
  ['SA','Saudi Arabia','+966','🇸🇦'],['SN','Senegal','+221','🇸🇳'],['RS','Serbia','+381','🇷🇸'],
  ['SC','Seychelles','+248','🇸🇨'],['SL','Sierra Leone','+232','🇸🇱'],['SG','Singapore','+65','🇸🇬'],
  ['SK','Slovakia','+421','🇸🇰'],['SI','Slovenia','+386','🇸🇮'],['SB','Solomon Islands','+677','🇸🇧'],
  ['SO','Somalia','+252','🇸🇴'],['ZA','South Africa','+27','🇿🇦'],['KR','South Korea','+82','🇰🇷'],
  ['SS','South Sudan','+211','🇸🇸'],['ES','Spain','+34','🇪🇸'],['LK','Sri Lanka','+94','🇱🇰'],
  ['SD','Sudan','+249','🇸🇩'],['SR','Suriname','+597','🇸🇷'],['SE','Sweden','+46','🇸🇪'],
  ['CH','Switzerland','+41','🇨🇭'],['SY','Syria','+963','🇸🇾'],['TW','Taiwan','+886','🇹🇼'],
  ['TJ','Tajikistan','+992','🇹🇯'],['TZ','Tanzania','+255','🇹🇿'],['TH','Thailand','+66','🇹🇭'],
  ['TL','Timor-Leste','+670','🇹🇱'],['TG','Togo','+228','🇹🇬'],['TO','Tonga','+676','🇹🇴'],
  ['TT','Trinidad and Tobago','+1','🇹🇹'],['TN','Tunisia','+216','🇹🇳'],['TR','Turkey','+90','🇹🇷'],
  ['TM','Turkmenistan','+993','🇹🇲'],['TV','Tuvalu','+688','🇹🇻'],['UG','Uganda','+256','🇺🇬'],
  ['UA','Ukraine','+380','🇺🇦'],['AE','United Arab Emirates','+971','🇦🇪'],
  ['GB','United Kingdom','+44','🇬🇧'],['US','United States','+1','🇺🇸'],['UY','Uruguay','+598','🇺🇾'],
  ['UZ','Uzbekistan','+998','🇺🇿'],['VU','Vanuatu','+678','🇻🇺'],['VE','Venezuela','+58','🇻🇪'],
  ['VN','Vietnam','+84','🇻🇳'],['YE','Yemen','+967','🇾🇪'],['ZM','Zambia','+260','🇿🇲'],
  ['ZW','Zimbabwe','+263','🇿🇼'],
];

// Currency model only has: code name symbol type network decimals isActive
// minDeposit minWithdrawal maxWithdrawal withdrawalFeeFixed withdrawalFeePercent iconUrl
const CURRENCIES = [
  { code: 'USDT',       name: 'Tether',            symbol: 'USDT', type: 'CRYPTO' as const, network: 'TRC20',  decimals: 6  },
  { code: 'BTC',        name: 'Bitcoin',         symbol: 'BTC',  type: 'CRYPTO' as const, network: null,    decimals: 8  },
  { code: 'BNB',        name: 'BNB',             symbol: 'BNB',  type: 'CRYPTO' as const, network: 'BSC',    decimals: 18 },
  { code: 'ETH',        name: 'Ethereum',        symbol: 'ETH',  type: 'CRYPTO' as const, network: 'ERC20', decimals: 18 },
  { code: 'BCH',        name: 'Bitcoin Cash',    symbol: 'BCH',  type: 'CRYPTO' as const, network: null,    decimals: 8  },
  { code: 'SOL',        name: 'Solana',          symbol: 'SOL',  type: 'CRYPTO' as const, network: 'mainnet', decimals: 9 },
  { code: 'LTC',        name: 'Litecoin',        symbol: 'LTC',  type: 'CRYPTO' as const, network: null,    decimals: 8  },
  { code: 'TRX',        name: 'Tron',            symbol: 'TRX',  type: 'CRYPTO' as const, network: 'TRC20',  decimals: 6  },
  { code: 'GRAM',       name: 'Gram',            symbol: 'GRAM', type: 'CRYPTO' as const, network: 'mainnet', decimals: 9 },
  { code: 'USDC',       name: 'USD Coin',        symbol: 'USDC', type: 'CRYPTO' as const, network: 'ERC20', decimals: 6 },
];

const ROLES = [
  { name: 'BUYER',   description: 'Standard buyer account' },
  { name: 'SELLER',  description: 'Verified seller account' },
  { name: 'ADMIN',   description: 'Platform administrator'  },
  { name: 'SUPPORT', description: 'Platform support account' },
];

async function main() {
  console.log('🌱 Seeding database...\n');

  console.log(`  → Seeding ${COUNTRIES.length} countries...`);
  await prisma.country.createMany({
    data: COUNTRIES.map(([code, name, dialCode, flagEmoji]) => ({
      code, name, dialCode, flagEmoji, isSupported: true,
    })),
    skipDuplicates: true,
  });
  console.log(`  ✓ Countries done`);

  console.log(`  → Seeding ${CURRENCIES.length} currencies...`);
  await Promise.all(CURRENCIES.map(({ code, name, symbol, type, network, decimals }) =>
    prisma.currency.upsert({
      where: { code },
      create: { code, name, symbol, type, network, decimals, isActive: true },
      update: { name, symbol, type, network, decimals, isActive: true }
    })
  ));
  console.log(`  ✓ Currencies done`);

  console.log(`  → Seeding ${ROLES.length} roles...`);
  await Promise.all(ROLES.map((role) =>
    prisma.role.upsert({
      where: { name: role.name },
      create: role,
      update: { description: role.description }
    })
  ));
  console.log(`  ✓ Roles done`);

  console.log('\n✅ Seed complete.');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e.message ?? e); process.exit(1); })
  .finally(() => prisma.$disconnect());