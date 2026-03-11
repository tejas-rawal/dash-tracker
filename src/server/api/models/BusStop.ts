export class BusStop {
    id: string;
    name: string;
    code: number;
    lat: number;
    lon: number;

    constructor(data: {
      id: string;
      name: string;
      code: number;
      lat: number;
      lon: number;
    }) {
      this.id = data.id;
      this.name = data.name;
      this.code = data.code;
      this.lat = data.lat;
      this.lon = data.lon;
    }

    /**
     * Returns the lat-long location of the stop as an object.
     * @returns An object with `lat` and `lon` properties.
     */
    getLocation(): { lat: number, lon: number } {
      return { lat: this.lat, lon: this.lon };
    }
  }
