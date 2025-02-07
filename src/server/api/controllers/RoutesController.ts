export default {
  hello: (req: any, res: any, next: Function) => {
    res.status(200).send('Hello from Typescript!');
  }
};

