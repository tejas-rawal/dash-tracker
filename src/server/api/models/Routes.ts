export class RoutesModel {
  attributes: {
    // id
    longName: { type: 'string', required: true },
    shortName: { type: 'string', required: true },
    name: { type: 'string', required: true },
    type: { type: 'string', required: false }
  }

};
