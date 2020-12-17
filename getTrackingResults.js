(async function homePage() {
  const trackingForm = document.getElementById('tracking-form');
  const trackingContainerTemplate = document.getElementById('tracking-container-template');
  const formFailContainer = document.getElementById('tracking-form-fail-container');
  let trackingItemTemplate = trackingContainerTemplate.querySelector('#tracking-item-template');
  trackingItemTemplate = trackingItemTemplate.cloneNode(true);
  const trackingItems = trackingContainerTemplate.querySelector('#tracking-items');
  const loaderContainer = document.getElementById('loader-container');
  const trackingInput = document.getElementById('tracking-search-input');
  const trackingButton = document.getElementById('tracking-search-btn');
  const userLanguageCode = getLanguageCode();

  trackingForm.addEventListener("submit", async (event) => {
    try {
      event.preventDefault();
      trackingForm.checkValidity();
      trackingButton.disabled = true;

      // resets in case there was already a tracking number searched for
      formFailContainer.style.display = 'none';
      trackingContainerTemplate.style.display = 'none';
      trackingItems.innerHTML = '';

      loaderContainer.style.display = 'flex';

      console.log('start request');
      const url = getRequestUrl();
      const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-cache',
          redirect: 'follow',
          referrerPolicy: 'no-referrer',
      });
      const data = await response.json();
      console.log('res', response);
      console.log('json',data);

      const trackingOperations = data.tracking_operations;
      if (Array.isArray(trackingOperations) && trackingOperations.length) {
        /** Handle Russian Post Tracking API operation details:
        *
        * https://tracking.pochta.ru/support/dictionaries/operation_codes
        *
        * From the docs:
        * Note: for some operations, which require the attribute,
        * API of shipment tracking may return attribute value of 0.
        * The Client should interprete such attribute value as the absence of information on the attribute.
        * This rule has only one exception: operation 8 (processing), which has attribute 0 (Sorting) as normal.
        */

        // Get language code for retrieval of the API response's attribute keys.
        const apiLanguageCode = userLanguageCode === 'ru' ? 'RU' : 'EN';
        // Get general API information
        // TODO: Stop depending on the order of the operations somehow.
        // Get the general information from the very first operation.
        const lastTrackingOperationsIndex = trackingOperations.length - 1;
        const deliveryToCountry = trackingOperations[lastTrackingOperationsIndex]['address_parameters']['MailDirect'][`Name${apiLanguageCode}`];
        const deliveryToAddress = removeNonLetterCharacters(trackingOperations[lastTrackingOperationsIndex]['address_parameters']['DestinationAddress']['Description']);
        let deliveryFromCountry;
        // TODO: Add function for this.
        if (trackingOperations[lastTrackingOperationsIndex]['address_parameters']['CountryFrom']) {
          deliveryFromCountry = trackingOperations[lastTrackingOperationsIndex]['address_parameters']['CountryFrom'][`Name${apiLanguageCode}`];
        } else {
          deliveryFromCountry = trackingOperations[0]['address_parameters']['CountryFrom'][`Name${apiLanguageCode}`];
        }
        const deliveryFromAddress = removeNonLetterCharacters(trackingOperations[lastTrackingOperationsIndex]['address_parameters']['OperationAddress']['Description']);
        // Current operation is located in the very beginning of the array, since the sort order is reversed.
        const currentLocationCountry = trackingOperations[0]['address_parameters']['CountryOper'][`Name${apiLanguageCode}`];
        // set general info
        trackingContainerTemplate.querySelector('#tracking-detail-headline').innerText = `${data.headline} ${deliveryFromCountry} - ${deliveryToCountry}`;
        trackingContainerTemplate.querySelector('#tracking-detail-subheadline').innerText = trackingInput.value;
        trackingContainerTemplate.querySelector('#origin-location').innerText = `${[deliveryFromCountry, deliveryFromAddress].filter(val => val).join(', ')}`;
        trackingContainerTemplate.querySelector('#destination-location').innerText = `${[deliveryToCountry, deliveryToAddress].filter(val => val).join(', ')}`;
        trackingContainerTemplate.querySelector('#current-location').innerText = `${currentLocationCountry}`;

        // set tracking items
        for (const operation of trackingOperations) {
          const operationName = operation['operation_parameters']['OperAttr']['Name'];
          // Only set tracking item if the operation type name is available.
          if (!operationName) { continue; }
          const operationCountry = operation['address_parameters']['CountryOper'][`Name${apiLanguageCode}`];
          const operationAddress = removeNonLetterCharacters(operation['address_parameters']['OperationAddress']['Description']);
          const formattedDateTime = getFormattedDate(operation['operation_parameters']['OperDate']);
          const operationTypeName = operation['operation_parameters']['OperType']['Name'];
          const operationTypeId = operation['operation_parameters']['OperType']['Id'];

          const newTrackingItem = trackingItemTemplate.cloneNode(deep=true);
          newTrackingItem.removeAttribute('id');
          newTrackingItem.querySelector('#tracking-item-icon').src = getIconUrl(operationTypeId);

          newTrackingItem.querySelector('#tracking-item-headline').innerText = operationName;
          newTrackingItem.querySelector('#tracking-item-operation-location').innerText = `${[operationCountry, operationAddress].filter(val => val).join(', ')}`;
          newTrackingItem.querySelector('#tracking-item-operation-time').innerText = formattedDateTime;

          trackingItems.appendChild(newTrackingItem);
        }

        loaderContainer.style.display = 'none';
        trackingContainerTemplate.style.display = 'block';

        console.log('success');
      } else if (data.error) {
        console.error('error json', data.error);
        const formFailMessage = document.getElementById('tracking-form-fail-message');

        formFailMessage.innerText = data.error;
        loaderContainer.style.display = 'none';
        formFailContainer.style.display = 'block';
      }
      loaderContainer.style.display = 'none';
    } catch (e) {
      console.error('unexpected error');
      console.error(e);
      const formFailMessage = document.getElementById('tracking-form-fail-message');

      formFailMessage.innerText = translations['unexpectedError'][userLanguageCode];
      loaderContainer.style.display = 'none';
      formFailContainer.style.display = 'block';
    } finally {
      trackingButton.disabled = false;
    }
  })

  function getLanguageCode() {
    // The website is structured with directories for languages in the first
    // part of the URL path.
    const languageDirectory = window.location.pathname.split('/').filter(pathPart => pathPart)[0];
    // If no directory is given, then most probably we are at the
    // homepage, which uses the default language German.
    if (!languageDirectory) {
      return 'de';
    }
    // If the resulting path part isn't included in the supported languages codes
    // then most likely we are doing the request from local development.
    if (!['en', 'de', 'ru'].includes(languageDirectory)) {
      return 'en';
    }

    return languageDirectory;
  }

  function getRequestUrl() {
    const localBaseUrl = 'http://localhost:5000/api/tracking';
    const remoteBaseUrl = 'https://ruspost.herokuapp.com/api/tracking';
    const isLocalEnv = location.hostname === '' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const baseUrl = isLocalEnv ? localBaseUrl : remoteBaseUrl;
    return baseUrl + `?tracking_id=${trackingInput.value}&lang_code=${userLanguageCode}`;
  }

  /**
  * Handle the different types of icons to be shown.
  */
  const checkIconUrl = 'https://assets.website-files.com/5ef2311c8f2d5d28a241aa82/5fb787fedb3f051ba17f7ccc_tick.svg';
  const prohibitionIconUrl = 'https://assets.website-files.com/5ef2311c8f2d5d28a241aa82/5fb24af8dc26867ddea1a367_prohibition.svg';
  const packageIconUrl = 'https://uploads-ssl.webflow.com/5ef2311c8f2d5d28a241aa82/5f0ddd58de790955cac7b116_part2.PNG';
  const operationTypeIdToIconUrlMapping = {
    1: checkIconUrl,
    2: checkIconUrl,
    12: prohibitionIconUrl,
  }
  function getIconUrl(operTypeId) {
    return operationTypeIdToIconUrlMapping[operTypeId] ? operationTypeIdToIconUrlMapping[operTypeId] : packageIconUrl;
  }
  function getFormattedDate(date) {
    let operationDate = new Date(date);
    const day = (operationDate.getDate() < 10? '0' : '') + operationDate.getDate();
    const month = (operationDate.getMonth() < 10? '0' : '') + operationDate.getMonth();
    const formattedDate = `${day}.${month}.${operationDate.getFullYear()}`;
    return `${formattedDate}, ${operationDate.toTimeString().substr(0,5)}`;
  }
  function removeNonLetterCharacters(operAddr) {
    if (!operAddr) { return operAddr; }
    const newOperAddr = operAddr.replace(/[^a-zA-Z ]/g, "");
    return newOperAddr;
  }

  /**
   * Some translations are just javascript specific and are not to be gotten
   * form the API.
  */
  const translations = {
    'unexpectedError': {
      'de': 'Unerwarteter Fehler, bitte versuchen Sie es noch einmal, deaktivieren Sie Ihren Adblocker oder wenden sich an den Support.',
      'en': 'Unexpected Error, please try again or contact the support.',
      'ru': 'Неожиданная ошибка, пожалуйста попробуйте ещё раз или обратитесь в поддержку.'
    }
  }
})()
