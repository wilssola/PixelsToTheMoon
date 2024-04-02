interface Tree {
  id: string;

  previousState: string;
  previousTimestamp: number;

  currentState: string;
  currentTimestamp: number;

  growTimestamp?: number;
  timeRemaining?: number;
}

export default Tree;
