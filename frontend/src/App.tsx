import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink, split } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import ReviewDashboard from './components/ReviewDashboard';
import './App.css';

const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:3000';
const APPSYNC_URL = import.meta.env.VITE_APPSYNC_URL || 'http://localhost:3000/graphql';

const httpLink = createHttpLink({
  uri: APPSYNC_URL,
});

const wsLink = new GraphQLWsLink(createClient({
  url: APPSYNC_URL.replace('https://', 'wss://').replace('/graphql', '/realtime'),
  connectionParams: {
    host: APPSYNC_URL.replace('https://', ''),
    'x-api-key': import.meta.env.VITE_APPSYNC_API_KEY || '',
  },
}));

const authLink = setContext((_, { headers }) => {
  return {
    headers: {
      ...headers,
      'x-api-key': import.meta.env.VITE_APPSYNC_API_KEY || '',
    }
  };
});

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  authLink.concat(httpLink),
);

const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});

function App() {
  return (
    <ApolloProvider client={client}>
      <div className="App">
        <header className="App-header">
          <h1>AWS Well-Architected レビュープラットフォーム</h1>
          <p>AIエージェントによる自動アーキテクチャ評価</p>
        </header>
        <main>
          <ReviewDashboard apiUrl={API_GATEWAY_URL} />
        </main>
      </div>
    </ApolloProvider>
  );
}

export default App
