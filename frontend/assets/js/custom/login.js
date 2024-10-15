

$(document).ready(function() {
    // Function to get query parameters from the URL
    function getQueryParams() {
        const params = {};
        const queryString = window.location.search.substring(1);
        const regex = /([^&=]+)=([^&]*)/g;
        let m;
        while (m = regex.exec(queryString)) {
            params[decodeURIComponent(m[1])] = decodeURIComponent(m[2]);
        }
        return params;
    }

    // Extract state and code from URL
    const params = getQueryParams();
    const state = params.state;
    const code = params.code;

    // Check if state and code are present
    if (state && code) {
        // Prepare data to send
        const dataToSend = {
            state: state,
            code: code
        };

        // Send POST request to your Flask API
        $.ajax({
            url: `${AUTH_DOMAIN}/gauth`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(dataToSend),
            success: function(response) {
                // The server automatically sets the cookie
                console.log('User authenticated successfully:', response);
                setCookie('X-Session-Key', response.data, 300);
                window.location.href = "/"
            },
            error: function(xhr, status, error) {
                console.error('Error occurred during authentication:', error);
            }
        });
    } else {
        console.error('State and code are required.');
    }
});



function setCookie(name,value,days) {
    var expires = "";
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days*24*60*60*1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}