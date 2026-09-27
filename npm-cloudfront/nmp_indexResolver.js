function handler(event) {
    var request = event.request;
    var uri = request.uri || '/';

    // Ensure leading slash
    if (!uri.startsWith('/')) {
        uri = '/' + uri;
    }

    // Normalize root
    if (uri === '/' || uri === '') {
        uri = '/index.html';
    } else if (uri.endsWith('/')) {
        uri = uri + 'index.html';
    } else if (!uri.includes('.')) {
        // Avoid double appending index.html
        if (!uri.endsWith('/index.html')) {
            uri = uri + '/index.html';
        }
    }

    request.uri = uri;
    return request;
}
