import type { BusStop } from './BusStop';

export class RouteDirection {
    id: string;
    title: string;
    stops: BusStop[];
    headSigns: string[];

    constructor(data: {
      id: string;
      title: string;
      stops: BusStop[];
      headSigns: string[];
    }) {
      this.id = data.id;
      this.title = data.title;
      this.stops = data.stops;
      this.headSigns = data.headSigns;
    }

    getFirstStop(): BusStop | undefined {
      return this.stops[0];
    }

    getLastStop(): BusStop | undefined {
      return this.stops[this.stops.length - 1];
    }

    getNumberOfStops(): number {
      return this.stops.length;
    }
  }
