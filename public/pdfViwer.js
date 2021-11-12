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
var socket = io({ path: '/virtualpresentation/socket.io' });
//Variables pdf y html
var header = document.getElementsByTagName("header");
var container = document.getElementById("div_container");
var divqr = document.getElementById("div_qr");
var divpdf = document.getElementById("div_pdfviwer");
var divsidebar = document.getElementById("div_sidebar");
var listaNotas = document.getElementById("listaNotas");
var notasFijas = document.getElementById("notasFijas");
//Variables de la sesión
var usuario = document.getElementById("usuario").innerHTML;
var sesion = document.getElementById("nombreSesion").innerHTML;
var presentacion = document.getElementById("presentacion").innerHTML;

var cerrar = false;

const DEFAULT_URL = '/private/' + usuario + '/' + presentacion;
const TIEMPO_PETICIONES = 150;

divpdf.style.display = "none"; //oculto
divqr.style.display = "block"; //visible

/** Visualizar pdf */
if (!pdfjsLib.getDocument || !pdfjsViewer.PDFPageView) {
    alert("Please build the pdfjs-dist library using\n  `gulp dist-install`");
}

// Se especificará la propiedad workerSrc.
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf-reader/build/pdf.worker.js";

// Algunos PDFs necesitan cmaps externos.
var CMAP_URL = "/pdf-reader/cmaps/";
var CMAP_PACKED = true;

var PAGE_TO_VIEW = 1;
const SCALE_INIT = 0.9;
var SCALE = SCALE_INIT;
var pdfDoc;

var eventBus = new pdfjsViewer.EventBus();

// Carga del documento
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
        // Documento cargado, obtener la página
        return pdfDocument.getPage(PAGE_TO_VIEW).then(function (pdfPage) {
            // Creando la vista de página con parámetros predeterminados.
            var pdfPageView = new pdfjsViewer.PDFPageView({
                container: container,
                id: PAGE_TO_VIEW,
                scale: SCALE,
                defaultViewport: pdfPage.getViewport({ scale: SCALE }),
                eventBus: eventBus,
                // Capas de texto y anotaciones
                textLayerFactory: new pdfjsViewer.DefaultTextLayerFactory(),
                annotationLayerFactory: new pdfjsViewer.DefaultAnnotationLayerFactory(),
            });
            // Asociar la página a la vista y mostrarla
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

/** Funcionamiento socket **/
/**
 * Cambia de página comprobando que la nueva está en los límites del documento
 * @param {number} pagina número de página a la que acceder
 */
function cambiapagina(pagina) {
    if (pdfDoc == null || pagina > pdfDoc.numPages || pagina < 1) {
        enviar("Error: Página inválida!");
    } else {
        PAGE_TO_VIEW = pagina;
        enviar("Página:" + PAGE_TO_VIEW);
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

function notas(nota) {

    if (nota.length > 0) {
        var li = document.createElement("li");
        var date = new Date();
        var minutos = date.getMinutes();
        if (minutos < 10) {
            minutos = '0' + minutos;
        }
        var id = 'temp_' + date.getSeconds() + '_' + date.getMilliseconds();
        li.id = id;
        var elimina = `<a class="elimina" onclick="eliminaNotaTemporal('${id}')">   X</a>`;
        var horaPag = "<em style='font-size: 12px;'>[" + date.getHours() + ":"
            + minutos + ` - <a class="pagina" onclick="cambiapagina(${PAGE_TO_VIEW})">P.${PAGE_TO_VIEW}</a>]</em>${elimina}<br>`;
        li.innerHTML = horaPag + nota;
        listaNotas.appendChild(li);
    }
}

function notafija(nota, pagina, id) {

    if (nota.length > 0) {
        var li = document.createElement("li");
        li.id = id;
        var elimina = `<a class="elimina" onclick="eliminaNotaFija('${id}')">   X</a>`;
        var hoy = `<em style='font-size: 12px;'>[hoy]
        [<a class="pagina" onclick="cambiapagina(${pagina})">P.${pagina}</a>]</em>${elimina}<br>`;
        li.innerHTML = hoy + nota;
        notasFijas.appendChild(li);
    }
}

function eliminaNotaFija(idNota) {
    var nota = document.getElementById(idNota);
    if (nota) {
        document.getElementById("notasFijas").removeChild(nota);
        var usuarioWeb = usuario;
        var mensaje = {
            sesion: sesion,
            usuario: usuarioWeb,
            eliminar: idNota
        }
        socket.emit("virtualPresentations", mensaje);
    }
}

function eliminaNotaTemporal(idNota) {
    var nota = document.getElementById(idNota);
    if (nota) document.getElementById("listaNotas").removeChild(nota);
}

function eliminarNotas() {
    listaNotas.innerHTML = "";
}

//Comunicación socket
var peticAnterior = 0;
socket.on(sesion, function (msg) {
    var peticNueva = Date.now();
    var user = msg.usuario;
    var sessionApp = msg.sesion;
    var diferencia = peticNueva - peticAnterior; //Para comprobar que no se realizan varias peticiones seguidas
    if (sessionApp == sesion) {
        if (user == usuario && diferencia >= TIEMPO_PETICIONES && msg.mensaje) {
            var pagina = 1;
            //Página específica
            if (msg.mensaje.startsWith("pnum")) {
                pagina = msg.mensaje.split("-")[1];
                var p = parseInt(pagina, 10); //entero decimal
                return cambiapagina(p);
            }
            switch (msg.mensaje) {
                case "OK":
                    cerrar = true;
                    divpdf.style.display = "block"; // block: mostrar
                    divqr.style.display = "none"; //none: ocultar;
                    header[0].style.display = "none";
                    enviar("Página inicial:" + PAGE_TO_VIEW);
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
                    window.scrollTo({ top: 0, left: 0 });
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
                case "muestraNotas":
                    mostrarOcultar();
                    break;
                case "eliminaNotas":
                    eliminarNotas();
                    break;
                case "FIN":
                    cerrar = false;
                    setTimeout(() => {
                        var url = location.href;
                        window.location.replace(url);
                    }, 500);
                    break;
                default:
                    enviar("Comando no reconocido");
                    break;
            }
            peticAnterior = peticNueva;
        } else if (msg.nota && diferencia >= TIEMPO_PETICIONES) {
            if (msg.fijar) {
                notafija(msg.nota, msg.pagina, msg.id);
            } else {
                notas(msg.nota);
            }
        }
    }
});

/**
 * Envía datos a la aplicación móvil con el usuario "web-" seguido del usuario.
 * Enviado exclusivamente a la sesión definida
 * @param {String} texto 
 */
function enviar(texto) {
    var usuarioWeb = "web-" + usuario;
    var mensaje = {
        sesion: sesion,
        usuario: usuarioWeb,
        mensaje: texto
    }
    socket.emit("virtualPresentations", mensaje);
}

//pregunta si desea salir
window.addEventListener("beforeunload", function (e) {
    if (cerrar) {
        var confirmationMessage = "\o/";
        e.returnValue = confirmationMessage;     // Gecko, Trident, Chrome 34+
        return confirmationMessage;              // Gecko, WebKit, Chrome <34
    }
});

//al cerrar/recargar la página
window.onunload = function () {
    enviar("salir");
}

//Abre todos los enlaces en una nueva página
document.addEventListener("click", function (e) {
    if (e.target.tagName == "A") {
        e.target.setAttribute("target", "_blank");
    }
});