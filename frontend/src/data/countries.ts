export interface Country {
  code: string;
  name: string;
  dial: string;
  cities: string[];
}

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", dial: "+1", cities: ["New York", "Los Angeles", "Chicago", "Houston", "Austin", "Seattle", "Miami", "Denver", "Dallas", "San Francisco"] },
  { code: "GB", name: "United Kingdom", dial: "+44", cities: ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Bristol", "Liverpool", "Edinburgh"] },
  { code: "CA", name: "Canada", dial: "+1", cities: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa", "Edmonton"] },
  { code: "AU", name: "Australia", dial: "+61", cities: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"] },
  { code: "PK", name: "Pakistan", dial: "+92", cities: ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar"] },
  { code: "IN", name: "India", dial: "+91", cities: ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Pune", "Kolkata"] },
  { code: "AE", name: "United Arab Emirates", dial: "+971", cities: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"] },
  { code: "SA", name: "Saudi Arabia", dial: "+966", cities: ["Riyadh", "Jeddah", "Dammam", "Mecca", "Medina"] },
  { code: "QA", name: "Qatar", dial: "+974", cities: ["Doha"] },
  { code: "KW", name: "Kuwait", dial: "+965", cities: ["Kuwait City"] },
  { code: "BH", name: "Bahrain", dial: "+973", cities: ["Manama"] },
  { code: "OM", name: "Oman", dial: "+968", cities: ["Muscat"] },
  { code: "DE", name: "Germany", dial: "+49", cities: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne"] },
  { code: "FR", name: "France", dial: "+33", cities: ["Paris", "Lyon", "Marseille", "Toulouse", "Nice"] },
  { code: "NL", name: "Netherlands", dial: "+31", cities: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht"] },
  { code: "BE", name: "Belgium", dial: "+32", cities: ["Brussels", "Antwerp", "Ghent"] },
  { code: "ES", name: "Spain", dial: "+34", cities: ["Madrid", "Barcelona", "Valencia", "Seville", "Malaga"] },
  { code: "IT", name: "Italy", dial: "+39", cities: ["Rome", "Milan", "Naples", "Turin", "Florence"] },
  { code: "PT", name: "Portugal", dial: "+351", cities: ["Lisbon", "Porto"] },
  { code: "IE", name: "Ireland", dial: "+353", cities: ["Dublin", "Cork", "Galway"] },
  { code: "CH", name: "Switzerland", dial: "+41", cities: ["Zurich", "Geneva", "Basel"] },
  { code: "AT", name: "Austria", dial: "+43", cities: ["Vienna", "Salzburg", "Graz"] },
  { code: "SE", name: "Sweden", dial: "+46", cities: ["Stockholm", "Gothenburg", "Malmö"] },
  { code: "NO", name: "Norway", dial: "+47", cities: ["Oslo", "Bergen"] },
  { code: "DK", name: "Denmark", dial: "+45", cities: ["Copenhagen", "Aarhus"] },
  { code: "FI", name: "Finland", dial: "+358", cities: ["Helsinki"] },
  { code: "PL", name: "Poland", dial: "+48", cities: ["Warsaw", "Kraków", "Wrocław"] },
  { code: "TR", name: "Turkey", dial: "+90", cities: ["Istanbul", "Ankara", "Izmir", "Antalya"] },
  { code: "SG", name: "Singapore", dial: "+65", cities: ["Singapore"] },
  { code: "MY", name: "Malaysia", dial: "+60", cities: ["Kuala Lumpur", "Penang", "Johor Bahru"] },
  { code: "ID", name: "Indonesia", dial: "+62", cities: ["Jakarta", "Surabaya", "Bali"] },
  { code: "PH", name: "Philippines", dial: "+63", cities: ["Manila", "Cebu", "Davao"] },
  { code: "TH", name: "Thailand", dial: "+66", cities: ["Bangkok", "Phuket", "Chiang Mai"] },
  { code: "VN", name: "Vietnam", dial: "+84", cities: ["Ho Chi Minh City", "Hanoi", "Da Nang"] },
  { code: "JP", name: "Japan", dial: "+81", cities: ["Tokyo", "Osaka", "Yokohama"] },
  { code: "KR", name: "South Korea", dial: "+82", cities: ["Seoul", "Busan"] },
  { code: "HK", name: "Hong Kong", dial: "+852", cities: ["Hong Kong"] },
  { code: "BD", name: "Bangladesh", dial: "+880", cities: ["Dhaka", "Chittagong"] },
  { code: "LK", name: "Sri Lanka", dial: "+94", cities: ["Colombo"] },
  { code: "NZ", name: "New Zealand", dial: "+64", cities: ["Auckland", "Wellington", "Christchurch"] },
  { code: "ZA", name: "South Africa", dial: "+27", cities: ["Cape Town", "Johannesburg", "Durban", "Pretoria"] },
  { code: "NG", name: "Nigeria", dial: "+234", cities: ["Lagos", "Abuja"] },
  { code: "KE", name: "Kenya", dial: "+254", cities: ["Nairobi", "Mombasa"] },
  { code: "EG", name: "Egypt", dial: "+20", cities: ["Cairo", "Alexandria"] },
  { code: "MA", name: "Morocco", dial: "+212", cities: ["Casablanca", "Marrakesh", "Rabat"] },
  { code: "MX", name: "Mexico", dial: "+52", cities: ["Mexico City", "Guadalajara", "Monterrey", "Cancún"] },
  { code: "BR", name: "Brazil", dial: "+55", cities: ["São Paulo", "Rio de Janeiro", "Brasília"] },
  { code: "AR", name: "Argentina", dial: "+54", cities: ["Buenos Aires", "Córdoba"] },
  { code: "CL", name: "Chile", dial: "+56", cities: ["Santiago"] },
  { code: "CO", name: "Colombia", dial: "+57", cities: ["Bogotá", "Medellín"] },
];

export const NICHES = [
  "Dental Clinics",
  "Real Estate Agencies",
  "Restaurants",
  "IT Companies",
  "Law Firms",
  "Fitness Studios",
  "Auto Repair Shops",
  "Coffee Shops",
  "Accounting Firms",
  "Wedding Photographers",
];

export function countryByName(name: string): Country | undefined {
  return COUNTRIES.find((c) => c.name === name);
}
