import React from 'react'

interface AppProps {}

interface AppState {}

class App extends React.Component<AppProps, AppState> {
  constructor(props: AppProps) {
    super(props);
    this.state = {  };
  }
  render() {
    return ( <h1>Hello from maxine</h1> );
  }
}

export default App;