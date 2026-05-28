// Approximate lat/lng coordinates for major US/Canada sports fanbase
// cities. Used by the public games page to auto-select the team whose
// fanbase city is geographically nearest to the visitor.
//
// Keys are normalized lowercase fanbase strings (alphanum + space, no
// punctuation) — match the page's teamKey() normalization so a fanbase
// value of "St. Louis" or "New England" resolves cleanly.
//
// Values are [latitude, longitude] in decimal degrees. Coordinates
// point at the team's home venue when one venue dominates, otherwise
// the city centroid — accurate to a few miles, which is plenty for
// "which team is nearest to me" sorting.
window.TGB_TEAM_CITY_COORDS = {
  // NFL fanbase cities
  'arizona':       [33.5276, -112.2626], // State Farm Stadium, Glendale
  'atlanta':       [33.7553,  -84.4006],
  'baltimore':     [39.2779,  -76.6228],
  'buffalo':       [42.7738,  -78.7868], // Highmark Stadium, Orchard Park
  'carolina':      [35.2258,  -80.8528], // Bank of America Stadium, Charlotte
  'chicago':       [41.8625,  -87.6166],
  'cincinnati':    [39.0954,  -84.5160],
  'cleveland':     [41.5061,  -81.6996],
  'dallas':        [32.7473,  -97.0945], // AT&T Stadium, Arlington
  'denver':        [39.7439, -105.0201],
  'detroit':       [42.3400,  -83.0456],
  'green bay':     [44.5013,  -88.0622],
  'houston':       [29.6847,  -95.4109],
  'indianapolis':  [39.7601,  -86.1639],
  'jacksonville':  [30.3239,  -81.6373],
  'kansas city':   [39.0489,  -94.4839], // Arrowhead Stadium
  'las vegas':     [36.0907, -115.1834], // Allegiant Stadium
  'los angeles':   [33.9534, -118.3387], // SoFi Stadium, Inglewood
  'miami':         [25.9580,  -80.2389], // Hard Rock Stadium
  'minnesota':     [44.9737,  -93.2581], // U.S. Bank Stadium
  'new england':   [42.0909,  -71.2643], // Gillette Stadium, Foxboro
  'new orleans':   [29.9509,  -90.0815],
  'new york':      [40.8136,  -74.0744], // MetLife Stadium (NY/NJ)
  'philadelphia':  [39.9008,  -75.1675],
  'pittsburgh':    [40.4468,  -80.0158],
  'san francisco': [37.4030, -121.9700], // Levi's Stadium, Santa Clara
  'seattle':       [47.5952, -122.3316],
  'tampa bay':     [27.9759,  -82.5033],
  'tennessee':     [36.1665,  -86.7713], // Nashville
  'washington':    [38.9078,  -76.8645], // FedEx Field

  // NBA additions
  'boston':        [42.3662,  -71.0621], // TD Garden (also used by city centroid)
  'brooklyn':      [40.6826,  -73.9754],
  'charlotte':     [35.2251,  -80.8392],
  'golden state':  [37.7680, -122.3877], // Chase Center, SF
  'memphis':       [35.1382,  -90.0505],
  'milwaukee':     [43.0451,  -87.9172],
  'oklahoma city': [35.4634,  -97.5151],
  'orlando':       [28.5392,  -81.3839],
  'phoenix':       [33.4457, -112.0712],
  'portland':      [45.5316, -122.6668],
  'sacramento':    [38.5802, -121.4998],
  'san antonio':   [29.4270,  -98.4375],
  'toronto':       [43.6435,  -79.3791],
  'utah':          [40.7683, -111.9011], // Delta Center, Salt Lake City

  // MLB additions
  'anaheim':       [33.8003, -117.8827],
  'arlington':     [32.7474,  -97.0823], // Globe Life Field, Texas Rangers
  'bronx':         [40.8296,  -73.9262], // Yankee Stadium
  'oakland':       [37.7516, -122.2008],
  'queens':        [40.7571,  -73.8458], // Citi Field, Mets
  'st louis':      [38.6226,  -90.1928],
  'st petersburg': [27.7682,  -82.6534],
  'tampa':         [27.9504,  -82.4572],

  // NHL additions
  'calgary':       [51.0375, -114.0519],
  'edmonton':      [53.5469, -113.4929],
  'montreal':      [45.4960,  -73.5694],
  'ottawa':        [45.2969,  -75.9266],
  'raleigh':       [35.8033,  -78.7220], // Hurricanes
  'vancouver':     [49.2778, -123.1089],
  'winnipeg':      [49.8929,  -97.1436],

  // Common collegiate / alt fanbase strings
  'columbus':      [39.9612,  -82.9988],
  'nashville':     [36.1592,  -86.7785],
  'salt lake city':[40.7608, -111.8910],
  'st louis city': [38.6226,  -90.1928],
};
