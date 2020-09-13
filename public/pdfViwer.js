/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

/** Variables */
var socket = io();
//Variables pdf y html
var container = document.getElementById("pageContainer");
var divqr = document.getElementById("div_qr");
var divpdf = document.getElementById("div_pdfviwer");
var divsidebar = document.getElementById("div_sidebar");
var listaNotas = document.getElementById("listaNotas");
//Variables de la sesión
var usuario = document.getElementById("usuario").innerHTML;
var sesion = document.getElementById("nombreSocketRoom").innerHTML;
var presentacion = document.getElementById("presentacion").innerHTML;
var DEFAULT_URL = '/private/' + usuario + '/' + presentacion;

console.log("Conectado LEERPDF.JS; Sesion: " + sesion + '\r\n' + DEFAULT_URL);
divpdf.style.display = "none"; //oculto
divqr.style.display = "block"; //visible

/** Visualizar pdf */
if (!pdfjsLib.getDocument || !pdfjsViewer.PDFPageView) {
    alert("Please build the pdfjs-dist library using\n  `gulp dist-install`");
}

// The workerSrc property shall be specified.
//
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf-reader/build/pdf.worker.js";

// Some PDFs need external cmaps.
//
var CMAP_URL = "/pdf-reader/cmaps/";
var CMAP_PACKED = true;

//var DEFAULT_URL = "../private/admin/example.pdf";
var PAGE_TO_VIEW = 1;
const SCALE_INIT = 0.9;
var SCALE = SCALE_INIT;
var pdfDoc;

var eventBus = new pdfjsViewer.EventBus();

// Loading document.
var loadingTask = pdfjsLib.getDocument({
    url: DEFAULT_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: CMAP_PACKED,
});
//Inicio
loadingTask.promise.then(function (pdfDocument) {
    pdfDoc = pdfDocument;
    render();
});

/**
 * Carga la página pdf en html con las variables locales modificables 
 * de página y zoom
 */
function render() {
    var posicion = getScroll();
    loadingTask.promise.then(function (pdfDocument) {
        container.innerHTML = '';
        // Document loaded, retrieving the page.
        return pdfDocument.getPage(PAGE_TO_VIEW).then(function (pdfPage) {
            console.log('render: ' + PAGE_TO_VIEW);
            // Creating the page view with default parameters.
            var pdfPageView = new pdfjsViewer.PDFPageView({
                container: container,
                id: PAGE_TO_VIEW,
                scale: SCALE,
                defaultViewport: pdfPage.getViewport({ scale: SCALE }),
                eventBus: eventBus,
                // We can enable text/annotations layers, if needed
                textLayerFactory: new pdfjsViewer.DefaultTextLayerFactory(),
                annotationLayerFactory: new pdfjsViewer.DefaultAnnotationLayerFactory(),
            });
            // Associates the actual page with the view, and drawing it
            pdfPageView.setPdfPage(pdfPage);
            pdfPageView.draw();
            window.scrollTo(posicion);
            return;
        });
    });

}//fin function

/**
 * Obtiene la posición de scroll (top, left)
 */
function getScroll() {
    var left = 0, top = 0;
    if (typeof (window.pageYOffset) == 'number') {
        //Netscape compliant
        top = window.pageYOffset;
        left = window.pageXOffset;
    } else if (document.body && (document.body.scrollLeft || document.body.scrollTop)) {
        //DOM compliant
        top = document.body.scrollTop;
        left = document.body.scrollLeft;
    } else if (document.documentElement && (document.documentElement.scrollLeft || document.documentElement.scrollTop)) {
        //IE6 standards compliant mode
        top = document.documentElement.scrollTop;
        left = document.documentElement.scrollLeft;
    }
    return { top: top, left: left };
}

/** Funcionamiento socket */
/**
 * Cambia de página comprobando que la nueva está en los límites del documento
 * @param {number} pagina número de página a la que acceder
 */
function cambiapagina(pagina) {
    console.log("function cambiapagina");
    if (pdfDoc == null || pagina > pdfDoc.numPages || pagina < 1) {
        console.error("Petición de página inválida!");
        enviar("Error: Página inválida!");
        //return;
    } else {
        PAGE_TO_VIEW = pagina;
        document.getElementById("current_page").value = PAGE_TO_VIEW;
        enviar("Página: " + PAGE_TO_VIEW);
        render();
    }
}


var mostrar = true;
/**
 * Muestra u oculta la barra lateral de notas
 */
function mostrarOcultar() {
    if (mostrar) {
        //mostrar
        divsidebar.style.width = "200px";
        container.style.marginLeft = "200px";
        SCALE -= 0.1;
        render();
        mostrar = false;
    } else {
        //ocultar
        divsidebar.style.width = "0";
        container.style.marginLeft = "0";
        SCALE += 0.1;
        render();
        mostrar = true;
    }
}
document.getElementById('showNotes').addEventListener('click', mostrarOcultar);

function notas(nota) {

    if (nota.length > 0) {
        //console.log("nota: " + nota);
        var li = document.createElement("li");
        var date = new Date();
        var horaPag = "<em style='font-size: 12px;'>[" + date.getHours() + ":"
            + date.getMinutes() + " - P." + PAGE_TO_VIEW + "]</em><br>";
        li.innerHTML = horaPag + nota;
        listaNotas.appendChild(li);

        /*boton de notificación
        if (mostrar) {
          numero++;
          notificacion.innerHTML = numero;
          notificacion.style.display = "block";
        }*/
    }
}

function eliminarNotas() {
    listaNotas.innerHTML = "";
    //numero = 0;
}

//Comunicación socket
var peticAnterior = 0;
socket.on(sesion, function (msg) {
    var peticNueva = Date.now();
    var user = msg.usuario;
    var usuarioNota = usuario + "-nota";
    var diferencia = peticNueva - peticAnterior; //Para comprobar que no se realizan varias peticiones seguidas
    console.log('(' + peticNueva + ', ' + diferencia + ')socket id :' + socket.id
        + ' mensaje: ' + msg + ' usuario recibido:' + user);//muestra el id del socket

    if (user == usuario && diferencia >= 300) {
        var pagina = 0;
        //Página específica
        if (msg.mensaje.startsWith("pnum")) {
            pagina = msg.mensaje.split("-")[1];
            var p = parseInt(pagina, 10); //entero decimal
            console.log("Pagina recibida: " + p);
            return cambiapagina(p);
        }
        switch (msg.mensaje) {
            case "OK":
                divpdf.style.display = "block"; // block: mostrar
                divqr.style.display = "none"; //none: ocultar;
                enviar("Página: " + PAGE_TO_VIEW);
                break;
            case "pmas":
                pagina = PAGE_TO_VIEW + 1;
                cambiapagina(pagina);
                break;
            case "pmenos":
                pagina = PAGE_TO_VIEW - 1;
                cambiapagina(pagina);
                break;
            case "zmas":
                SCALE += 0.1;
                render();
                break;
            case "zmenos":
                SCALE -= 0.1;
                render();
                break;
            case "zinicial":
                window.scrollTo({top:0, left:0});
                SCALE = SCALE_INIT;
                render();
                break;
            case "subir":
                window.scrollBy({
                    top: -50,
                    left: 0
                });
                break;
            case "bajar":
                window.scrollBy({
                    top: 50,
                    left: 0
                });
                break;
            case "izquierda":
                window.scrollBy({
                    top: 0,
                    left: -50
                });
                break;
            case "derecha":
                window.scrollBy({
                    top: 0,
                    left: 50
                });
                break;
            case "muestra_oculta":
                mostrarOcultar();
                break;
            case "FIN":
                console.log("SE HA DESCONECTADO UN USUARIO"); //TODO probar que se cierra solo con la propia sesión
                divpdf.style.display = "none"; //oculto
                divqr.style.display = "block"; //visible
                break;
            default:
                //TODO emitir error ¿?
                break;
        }
        peticAnterior = peticNueva;
    } else if (user == usuarioNota && diferencia >= 300) {
        notas(msg.mensaje);
    }
});

/**
 * Envía datos a la aplicación móvil
 * @param {String} texto 
 */
function enviar(texto) {
    var mensaje = {
        usuario: 'web',
        mensaje: texto
    }
    socket.emit(sesion, mensaje);
}