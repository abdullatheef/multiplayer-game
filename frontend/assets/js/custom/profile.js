var token = getCookie('X-Session-Key')
var clearCookie = function (name) {
    // Set the cookie's expiration date to a past date
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
}
function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}
var CURRENT_USER
if (localStorage.getItem('CURRENT_USER')) {
    CURRENT_USER = JSON.parse(localStorage.getItem('CURRENT_USER'));
}
$(document).ready(function() {
    $.ajaxSetup({
        headers: {
            'X-Session-Key': getCookie('X-Session-Key') // Replace with a function to get the cookie value
        }
    });
    // Function to call the /me API
    function callMeApi() {
        $.ajax({
            url: `${AUTH_DOMAIN}/me`,
            method: 'GET',
            success: function(response) {
                console.log('User data retrieved:', response);
                CURRENT_USER = response
                localStorage.setItem('CURRENT_USER', JSON.stringify(CURRENT_USER));

                // Display the user information on the page
                $('.login-success').show()
                $('.login-failed').hide()
                $('#card-username').html(response.name)
                $('#card-email').html(response.email)

            },
            error: function(xhr, status, error) {
                console.error('Error retrieving user info:', error);
                localStorage.setItem('CURRENT_USER', null);
                if (window.location.pathname == "/"){
                    $('.login-success').hide()
                    $('.login-failed').show()
                    return false;
                }
                const Toast = Swal.mixin({
                    toast: true,
                    position: "top-end",
                    showConfirmButton: false,
                    timer: 2000,
                    timerProgressBar: true,
                    didOpen: (toast) => {
                      toast.onmouseenter = Swal.stopTimer;
                      toast.onmouseleave = Swal.resumeTimer;
                    }
                    });
                    Toast.fire({
                      icon: "error",
                      title: "Please login first.",
                    });
                setTimeout(() => {
                    window.location.href = "/"
                }, 1000)
            }
        });
    }

    // Event handler for button click
    callMeApi();
});

$(document).ready(function() {
    $('#auth-button').on('click', function(event) {
        event.preventDefault(); // Prevent the default link behavior

        // Send POST request to the /gauth endpoint
        $.ajax({
            url: `${AUTH_DOMAIN}/gauth`,
            method: 'GET',
            contentType: 'application/json',
            success: function(response) {
                // Check if the response contains the data
                if (response.status === 1 && response.data) {
                    // Redirect to the URL provided in the response
                    window.location.href = response.data;
                } else {
                    console.error('Unexpected response:', response);
                }
            },
            error: function(xhr, status, error) {
                console.error('Error occurred while requesting /gauth:', error);
            }
        });
    });
});
