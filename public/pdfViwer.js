//socketIO
//var socket = io('ws://localhost:8080');
var socket = io();
//Variables pdf y html
var canvas = document.getElementById("pdf_renderer");
var divqr = document.getElementById("div_qr");
var divpdf = document.getElementById("div_pdfviwer");
//Variables de la sesión
var usuario = document.getElementById("usuario").innerHTML;
var sesion = document.getElementById("nombreSocketRoom").innerHTML;
var presentacion = document.getElementById("presentacion").innerHTML;
var rutapdf = '/private/' + usuario + '/' + presentacion;
//Estado inicial del visor
var ctx = canvas.getContext('2d');
var myState = {
    pdf: null,
    currentPage: 1,
    zoom: 1
}


console.log("Conectado LEERPDF.JS; Sesion: " + sesion + '\r\n' + rutapdf);
divpdf.style.display = "none"; //oculto
divqr.style.display = "block"; //visible

pdfjsLib.getDocument(rutapdf).then((pdf) => {

    myState.pdf = pdf;
    render();
});

/**
 * Función para mostrar el pdf en la web
 */
function render() {
    myState.pdf.getPage(myState.currentPage).then((page) => {
        var viewport = page.getViewport(myState.zoom);
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        page.render({
            canvasContext: ctx,
            viewport: viewport
        });

    });
}
document.getElementById('go_previous')
    .addEventListener('click', (e) => {
        if (myState.pdf == null ||
            myState.currentPage == 1) return;
        myState.currentPage -= 1;
        document.getElementById("current_page")
            .value = myState.currentPage;
        render();
    });
document.getElementById('go_next')
    .addEventListener('click', (e) => {
        if (myState.pdf == null ||
            myState.currentPage > myState.pdf
                ._pdfInfo.numPages)
            return;

        myState.currentPage += 1;
        document.getElementById("current_page")
            .value = myState.currentPage;
        render();
    });

document.getElementById('current_page')
    .addEventListener('keypress', (e) => {
        if (myState.pdf == null) return;

        // Get key code
        var code = (e.keyCode ? e.keyCode : e.which);

        // If key code matches that of the Enter key
        if (code == 13) {
            var desiredPage =
                document.getElementById('current_page')
                    .valueAsNumber;

            if (desiredPage >= 1 &&
                desiredPage <= myState.pdf
                    ._pdfInfo.numPages) {
                myState.currentPage = desiredPage;
                document.getElementById("current_page")
                    .value = desiredPage;
                render();
            }
        }
    });

document.getElementById('zoom_in')
    .addEventListener('click', (e) => {
        if (myState.pdf == null) return;
        myState.zoom += 0.5;
        render();
    });
document.getElementById('zoom_out')
    .addEventListener('click', (e) => {
        if (myState.pdf == null) return;
        myState.zoom -= 0.5;
        render();
    });
window.onwheel = function (e) {
    e.preventDefault();

    if (e.ctrlKey) {

        scale -= e.deltaY + 0.01;
    } else {
        posX -= e.deltaX * 2;
        posY -= e.deltaY * 2;
    }

    render();
};
/**
 * Pruebas para leer por consola el número de página a la que ir
 */

function cambiapagina(/*pg*/) {
    console.log("function cambiapagina");
    if (myState.pdf == null || myState.currentPage > myState.pdf._pdfInfo.numPages) {
        return;
    } else {
        //myState.currentPage = pg;
        document.getElementById("current_page").value = myState.currentPage;
        render();
    }


}
//var p = 0;
//socket.on('cambia pagina', function (msg) {
socket.on(sesion, function (msg) {
    var user = msg.usuario;
    //var pagina = parseInt(msg.mensaje);


    console.log('socket id :' + socket.id + ' mensaje: ' + msg + ' usuario recibido:' + user);//muestra el id del socket

    if (user == usuario) {
        switch (msg.mensaje) {
            case "OK":
                divpdf.style.display = "block"; // block: mostrar
                divqr.style.display = "none"; //none: ocultar;
                break;
            case "pmas":
                myState.currentPage++;
                cambiapagina();
                break;
            case "pmenos":
                myState.currentPage--;
                cambiapagina();
                break;

            case "zmas":
                myState.zoom += 0.5;
                render();
                break;
            case "zmenos":
                myState.zoom -= 0.5;
                render();
                break;

            default:
                //TODO emitir error ¿?
                break;
        }
    }

    if (msg.mensaje == "OK") {
        divpdf.style.display = "block"; // block: mostrar
        divqr.style.display = "none"; //none: ocultar;
    } else if (msg.mensaje == "mas") {
        myState.currentPage++;
        cambiapagina();
    } else if (msg.mensaje == "menos") {
        myState.currentPage--;
        cambiapagina();
    }
    //if (msg.usuario == socket.id){
    /*    if (user =="adminOK"){
            divpdf.style.display = "block"; // block: mostrar
            divqr.style.display = "none"; //none: ocultar;
        }*/
    /*if (user == 'admin'){
        
        if (isNaN(pagina)) {
            console.error('Parámetro no válido');
        } else {
            console.log('Numero de página:' + pagina + '.');
            if (pagina!=p){ //Evita que se recargue la pagina innecesariamente
                cambiapagina(pagina);
                p=pagina;
            }
            
        }
    } else {
        console.error("Los datos recibidos no son correctos");
    }
*/
    if (msg == "desconectado") {
        console.log("SE HA DESCONECTADO UN USUARIO");
        divpdf.style.display = "none"; //oculto
        divqr.style.display = "block"; //visible
    }

});